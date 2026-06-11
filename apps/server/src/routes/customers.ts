import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, or, ilike } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { customers, customerPoints, pointTransactions } from "../db/schema/index.js"
import { requireAuth } from "../middleware/auth.js"
import { phoneSchema } from "@inbill/shared"

export const customersRouter = new Hono<AppEnv>()

customersRouter.use("*", requireAuth)

const createCustomerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
})

const updateCustomerSchema = z.object({
  phone: phoneSchema.optional(),
  name: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
})

const loyaltyDeltaSchema = z.object({
  delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, { message: "delta must be non-zero" }),
  note: z.string().max(200).optional(),
})

customersRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const q = c.req.query("search") ?? ""

  const results = await db.query.customers.findMany({
    where: q
      ? and(eq(customers.outletId, outletId), or(ilike(customers.phone, `%${q}%`), ilike(customers.name, `%${q}%`)))
      : eq(customers.outletId, outletId),
    limit: 20,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
  return c.json(results)
})

customersRouter.post("/", zValidator("json", createCustomerSchema), async (c) => {
  const { outletId } = c.get("user")
  const { phone, name } = c.req.valid("json")

  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.outletId, outletId), eq(customers.phone, phone)),
  })

  if (existing) {
    if (name !== undefined && name !== existing.name) {
      const [updated] = await db.update(customers).set({ name }).where(eq(customers.id, existing.id)).returning()
      return c.json(updated)
    }
    return c.json(existing)
  }

  const [created] = await db.insert(customers).values({ outletId, phone, name }).returning()
  return c.json(created, 201)
})

customersRouter.get("/:id", async (c) => {
  const { outletId } = c.get("user")
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, c.req.param("id")), eq(customers.outletId, outletId)),
  })
  if (!customer) return c.json({ error: "Not found" }, 404)
  return c.json(customer)
})

customersRouter.patch("/:id", zValidator("json", updateCustomerSchema), async (c) => {
  const { outletId } = c.get("user")
  const body = c.req.valid("json")
  const [updated] = await db.update(customers).set(body)
    .where(and(eq(customers.id, c.req.param("id")), eq(customers.outletId, outletId)))
    .returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

customersRouter.post("/:id/loyalty", zValidator("json", loyaltyDeltaSchema), async (c) => {
  const { outletId } = c.get("user")
  const { delta, note } = c.req.valid("json")

  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, c.req.param("id")), eq(customers.outletId, outletId)),
  })
  if (!customer) return c.json({ error: "Not found" }, 404)

  const newBalance = customer.loyaltyPoints + delta
  if (newBalance < 0) return c.json({ error: "Adjustment would result in a negative point balance" }, 400)

  const [updated] = await db.update(customers)
    .set({ loyaltyPoints: newBalance })
    .where(eq(customers.id, customer.id))
    .returning()

  // Sync customerPoints table
  const existing = await db.query.customerPoints.findFirst({
    where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, customer.id)),
  })
  if (existing) {
    const newLifetime = delta > 0 ? existing.lifetimePoints + delta : existing.lifetimePoints
    const tier = newLifetime >= 10000 ? "gold" : newLifetime >= 3000 ? "silver" : "bronze"
    await db.update(customerPoints)
      .set({ totalPoints: newBalance, lifetimePoints: newLifetime, tier, updatedAt: new Date() })
      .where(eq(customerPoints.id, existing.id))
  } else if (newBalance > 0) {
    const tier = newBalance >= 10000 ? "gold" : newBalance >= 3000 ? "silver" : "bronze"
    await db.insert(customerPoints).values({
      outletId, customerId: customer.id,
      totalPoints: newBalance, lifetimePoints: Math.max(0, delta), tier,
    })
  }

  await db.insert(pointTransactions).values({
    outletId,
    customerId: customer.id,
    delta,
    type: delta > 0 ? "earn" : "redeem",
    note: note ?? `Manual adjustment: ${delta > 0 ? "+" : ""}${delta} pts`,
  })

  return c.json(updated)
})