import { Hono } from "hono"
import { eq, and, or, inArray } from "drizzle-orm"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { kots, orderItems, orders } from "../db/schema/index.js"
import { requireAuth } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"
import { fetchOrderWithKotStatus } from "../lib/queries.js"

export const kotsRouter = new Hono<AppEnv>()

kotsRouter.use("*", requireAuth)

// Active KOTs (pending + acknowledged) with their items for the KDS
kotsRouter.get("/", async (c) => {
  const { outletId } = c.get("user")

  const activeKots = await db.query.kots.findMany({
    where: and(eq(kots.outletId, outletId), or(eq(kots.status, "pending"), eq(kots.status, "acknowledged"))),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })

  if (activeKots.length === 0) return c.json([])

  const kotIds = activeKots.map((k) => k.id)
  const items = await db.query.orderItems.findMany({
    where: and(inArray(orderItems.kotId, kotIds), eq(orderItems.isVoided, false)),
    with: { modifiers: true },
  })

  return c.json(activeKots.map((kot) => ({ ...kot, items: items.filter((i) => i.kotId === kot.id) })))
})

kotsRouter.patch("/:id/acknowledge", async (c) => {
  const { outletId } = c.get("user")
  await db.update(kots).set({ status: "acknowledged" }).where(and(eq(kots.id, c.req.param("id")), eq(kots.outletId, outletId)))
  broadcastOutlet(outletId, { type: "kot.acknowledged", payload: { kotId: c.req.param("id") } })
  return c.body(null, 204)
})

kotsRouter.patch("/:id/done", async (c) => {
  const { outletId } = c.get("user")
  const kotId = c.req.param("id")
  await db.update(kots).set({ status: "done" }).where(and(eq(kots.id, kotId), eq(kots.outletId, outletId)))
  broadcastOutlet(outletId, { type: "kot.done", payload: { kotId } })

  const kot = await db.query.kots.findFirst({ where: eq(kots.id, kotId) })
  if (kot) {
    // If all KOTs for this order are now done, advance order status to "served"
    const allKots = await db.query.kots.findMany({ where: eq(kots.orderId, kot.orderId) })
    const allDone = allKots.every((k) => k.id === kotId || k.status === "done")
    if (allDone) {
      await db.update(orders).set({ status: "served", updatedAt: new Date() }).where(eq(orders.id, kot.orderId))
    }
    broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(kot.orderId) as never })
  }

  return c.body(null, 204)
})
