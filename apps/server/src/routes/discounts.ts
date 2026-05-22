import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { createDiscountSchema, updateDiscountSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { discounts, billDiscounts } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const discountsRouter = new Hono<AppEnv>()

discountsRouter.use("*", requireAuth)

discountsRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.discounts.findMany({
    where: eq(discounts.outletId, outletId),
    orderBy: (d, { asc }) => [asc(d.name)],
  })
  return c.json(rows)
})

discountsRouter.post("/", requireRole("owner"), zValidator("json", createDiscountSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")

  if (data.code) {
    const existing = await db.query.discounts.findFirst({
      where: and(eq(discounts.outletId, outletId), eq(discounts.code, data.code)),
    })
    if (existing) return c.json({ error: "A discount with this code already exists" }, 409)
  }

  const [row] = await db.insert(discounts).values({
    ...data,
    outletId,
    value: String(data.value),
    minOrderValue: String(data.minOrderValue ?? 0),
    maxDiscountAmount: data.maxDiscountAmount ? String(data.maxDiscountAmount) : null,
    validFrom: data.validFrom ? new Date(data.validFrom) : null,
    validTo: data.validTo ? new Date(data.validTo) : null,
  }).returning()
  return c.json(row, 201)
})

discountsRouter.patch("/:id", requireRole("owner"), zValidator("json", updateDiscountSchema), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const data = c.req.valid("json")

  const existing = await db.query.discounts.findFirst({ where: and(eq(discounts.id, id), eq(discounts.outletId, outletId)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const updates: Record<string, unknown> = {}
  if (data.name !== undefined) updates.name = data.name
  if (data.type !== undefined) updates.type = data.type
  if (data.value !== undefined) updates.value = String(data.value)
  if (data.minOrderValue !== undefined) updates.minOrderValue = String(data.minOrderValue)
  if (data.maxDiscountAmount !== undefined) updates.maxDiscountAmount = data.maxDiscountAmount ? String(data.maxDiscountAmount) : null
  if (data.code !== undefined) updates.code = data.code || null
  if (data.validFrom !== undefined) updates.validFrom = data.validFrom ? new Date(data.validFrom) : null
  if (data.validTo !== undefined) updates.validTo = data.validTo ? new Date(data.validTo) : null
  if (data.usageLimit !== undefined) updates.usageLimit = data.usageLimit ?? null
  if (data.isActive !== undefined) updates.isActive = data.isActive

  const [updated] = await db.update(discounts).set(updates).where(eq(discounts.id, id)).returning()
  return c.json(updated)
})

discountsRouter.delete("/:id", requireRole("owner"), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const existing = await db.query.discounts.findFirst({ where: and(eq(discounts.id, id), eq(discounts.outletId, outletId)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const used = await db.query.billDiscounts.findFirst({ where: eq(billDiscounts.discountId, id) })
  if (used) return c.json({ error: "Discount has been applied to bills and cannot be deleted. Deactivate it instead." }, 409)

  await db.delete(discounts).where(eq(discounts.id, id))
  return c.json({ ok: true })
})

const validateSchema = z.object({
  code: z.string().min(1),
  orderTotal: z.number().positive(),
})

discountsRouter.post("/validate", zValidator("json", validateSchema), async (c) => {
  const { outletId } = c.get("user")
  const { code, orderTotal } = c.req.valid("json")

  const discount = await db.query.discounts.findFirst({
    where: and(eq(discounts.outletId, outletId), eq(discounts.code, code), eq(discounts.isActive, true)),
  })

  if (!discount) return c.json({ error: "Invalid or expired coupon code" }, 404)

  const now = new Date()
  if (discount.validFrom && new Date(discount.validFrom) > now) return c.json({ error: "Coupon is not yet valid" }, 400)
  if (discount.validTo && new Date(discount.validTo) < now) return c.json({ error: "Coupon has expired" }, 400)
  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) return c.json({ error: "Coupon usage limit reached" }, 400)
  if (orderTotal < Number(discount.minOrderValue)) {
    return c.json({ error: `Minimum order value for this discount is ₹${discount.minOrderValue}` }, 400)
  }

  let amount = discount.type === "percentage"
    ? (orderTotal * Number(discount.value)) / 100
    : Number(discount.value)

  if (discount.maxDiscountAmount) amount = Math.min(amount, Number(discount.maxDiscountAmount))
  amount = Math.min(amount, orderTotal)

  return c.json({ discount, amount: parseFloat(amount.toFixed(2)) })
})
