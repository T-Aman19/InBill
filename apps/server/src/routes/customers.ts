import { Hono } from "hono"
import { eq, and, or, ilike } from "drizzle-orm"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { customers } from "../db/schema/index.js"
import { requireAuth } from "../middleware/auth.js"

export const customersRouter = new Hono<AppEnv>()

customersRouter.use("*", requireAuth)

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

customersRouter.post("/", async (c) => {
  const { outletId } = c.get("user")
  const { phone, name } = await c.req.json() as { phone: string; name?: string }

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

customersRouter.patch("/:id", async (c) => {
  const { outletId } = c.get("user")
  const body = await c.req.json() as { name?: string; phone?: string }
  const [updated] = await db.update(customers).set(body)
    .where(and(eq(customers.id, c.req.param("id")), eq(customers.outletId, outletId)))
    .returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

customersRouter.post("/:id/loyalty", async (c) => {
  const { outletId } = c.get("user")
  const { delta } = await c.req.json() as { delta: number; note?: string }

  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, c.req.param("id")), eq(customers.outletId, outletId)),
  })
  if (!customer) return c.json({ error: "Not found" }, 404)

  const [updated] = await db.update(customers)
    .set({ loyaltyPoints: customer.loyaltyPoints + delta })
    .where(eq(customers.id, customer.id))
    .returning()
  return c.json(updated)
})
