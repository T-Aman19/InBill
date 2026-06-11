import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { vendors, purchaseOrders } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const vendorsRouter = new Hono<AppEnv>()

vendorsRouter.use("*", requireAuth, requireRole("owner", "manager"))

const vendorBody = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian mobile number").optional().or(z.literal("")),
  email: z.string().email().max(254).optional().or(z.literal("")),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN must be a valid 15-character Indian GST number")
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
})

vendorsRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.vendors.findMany({
    where: and(eq(vendors.outletId, outletId), eq(vendors.isActive, true)),
    with: { purchaseOrders: { columns: { id: true, status: true, createdAt: true } } },
    orderBy: vendors.name,
  })
  return c.json(rows.map((v) => ({
    ...v,
    openPOCount: v.purchaseOrders.filter((p) => p.status !== "received").length,
    lastPOAt: v.purchaseOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt ?? null,
    purchaseOrders: undefined,
  })))
})

vendorsRouter.post("/", zValidator("json", vendorBody), async (c) => {
  const { outletId } = c.get("user")
  const body = c.req.valid("json")
  const [row] = await db.insert(vendors).values({ outletId, ...body, email: body.email || null }).returning()
  return c.json(row, 201)
})

vendorsRouter.patch("/:id", zValidator("json", vendorBody.partial()), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const body = c.req.valid("json")

  const existing = await db.query.vendors.findFirst({ where: and(eq(vendors.id, id), eq(vendors.outletId, outletId)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const [row] = await db.update(vendors).set({ ...body, email: body.email || null }).where(eq(vendors.id, id)).returning()
  return c.json(row)
})

vendorsRouter.delete("/:id", async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const openPOs = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.vendorId, id), eq(purchaseOrders.outletId, outletId)),
    columns: { id: true, status: true },
  })
  if (openPOs && openPOs.status !== "received") {
    return c.json({ error: "Cannot delete vendor with open purchase orders" }, 400)
  }

  await db.update(vendors).set({ isActive: false }).where(and(eq(vendors.id, id), eq(vendors.outletId, outletId)))
  return c.json({ ok: true })
})
