import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import { createChargeSchema, updateChargeSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { charges, billCharges } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const chargesRouter = new Hono<AppEnv>()

chargesRouter.use("*", requireAuth)

chargesRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.charges.findMany({
    where: eq(charges.outletId, outletId),
    orderBy: (ch, { asc }) => [asc(ch.name)],
  })
  return c.json(rows)
})

chargesRouter.post("/", requireRole("owner"), zValidator("json", createChargeSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [row] = await db.insert(charges).values({ ...data, outletId, value: String(data.value) }).returning()
  return c.json(row, 201)
})

chargesRouter.patch("/:id", requireRole("owner"), zValidator("json", updateChargeSchema), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const data = c.req.valid("json")

  const existing = await db.query.charges.findFirst({ where: and(eq(charges.id, id), eq(charges.outletId, outletId)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const updates: Record<string, unknown> = {}
  if (data.name !== undefined) updates.name = data.name
  if (data.type !== undefined) updates.type = data.type
  if (data.value !== undefined) updates.value = String(data.value)
  if (data.isActive !== undefined) updates.isActive = data.isActive

  const [updated] = await db.update(charges).set(updates).where(eq(charges.id, id)).returning()
  return c.json(updated)
})

chargesRouter.delete("/:id", requireRole("owner"), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const existing = await db.query.charges.findFirst({ where: and(eq(charges.id, id), eq(charges.outletId, outletId)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const used = await db.query.billCharges.findFirst({ where: eq(billCharges.chargeId, id) })
  if (used) return c.json({ error: "Charge has been applied to bills and cannot be deleted. Deactivate it instead." }, 409)

  await db.delete(charges).where(eq(charges.id, id))
  return c.json({ ok: true })
})
