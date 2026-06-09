import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, inArray } from "drizzle-orm"
import { createTableSchema, updateTableSchema, createFloorSchema, updateFloorSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { floors, tables, orders } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const tablesRouter = new Hono<AppEnv>()

tablesRouter.use("*", requireAuth)

tablesRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const [floorList, tableList] = await Promise.all([
    db.query.floors.findMany({ where: eq(floors.outletId, outletId) }),
    db.query.tables.findMany({ where: eq(tables.outletId, outletId) }),
  ])

  const orderIds = tableList.map((t) => t.currentOrderId).filter((id): id is string => id !== null)

  type OrderInfo = { status: string; source: string; openedAt: string; items: number; total: number }
  let orderMap: Record<string, OrderInfo> = {}

  if (orderIds.length > 0) {
    const activeOrders = await db.query.orders.findMany({
      where: inArray(orders.id, orderIds),
      with: { items: true },
    })
    for (const order of activeOrders) {
      const active = order.items.filter((i) => !i.isVoided)
      orderMap[order.id] = {
        status: order.status,
        source: order.source,
        openedAt: order.createdAt.toISOString(),
        items: active.reduce((s, i) => s + i.quantity, 0),
        total: active.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
      }
    }
  }

  const enriched = tableList.map((t) => {
    const orderInfo = t.currentOrderId ? orderMap[t.currentOrderId] : null
    // Fall back to stored status (e.g. "reserved" set by host seating) when no active order
    let effectiveStatus: typeof t.status = t.status
    if (orderInfo) {
      if (orderInfo.status === "billed") effectiveStatus = "billed"
      else if (orderInfo.status === "cancelled") effectiveStatus = "available"
      else effectiveStatus = "occupied"
    }
    return {
      ...t,
      status: effectiveStatus,
      currentOrderId: orderInfo ? t.currentOrderId : null,
      ...(orderInfo ? { source: orderInfo.source, openedAt: orderInfo.openedAt, items: orderInfo.items, total: orderInfo.total } : {}),
    }
  })

  return c.json({ floors: floorList, tables: enriched })
})

// ── Floors ──────────────────────────────────────────────────────────────────
tablesRouter.post("/floors", requireRole("manager", "owner"), zValidator("json", createFloorSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [floor] = await db.insert(floors).values({ ...data, outletId }).returning()
  return c.json(floor, 201)
})

tablesRouter.patch("/floors/:id", requireRole("manager", "owner"), zValidator("json", updateFloorSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [floor] = await db.update(floors).set(data)
    .where(and(eq(floors.id, c.req.param("id")), eq(floors.outletId, outletId)))
    .returning()
  if (!floor) return c.json({ error: "Not found" }, 404)
  return c.json(floor)
})

tablesRouter.delete("/floors/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const occupied = await db.query.tables.findFirst({
    where: and(eq(tables.floorId, c.req.param("id")), eq(tables.outletId, outletId)),
  })
  if (occupied) return c.json({ error: "Remove all tables from this floor first" }, 400)
  await db.delete(floors).where(and(eq(floors.id, c.req.param("id")), eq(floors.outletId, outletId)))
  return c.body(null, 204)
})

// ── Tables ──────────────────────────────────────────────────────────────────
tablesRouter.post("/", requireRole("manager", "owner"), zValidator("json", createTableSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [table] = await db.insert(tables).values({ ...data, outletId }).returning()
  return c.json(table, 201)
})

tablesRouter.patch("/:id", requireRole("manager", "owner"), zValidator("json", updateTableSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [table] = await db.update(tables).set(data)
    .where(and(eq(tables.id, c.req.param("id")), eq(tables.outletId, outletId)))
    .returning()
  if (!table) return c.json({ error: "Not found" }, 404)
  return c.json(table)
})

tablesRouter.delete("/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const table = await db.query.tables.findFirst({
    where: and(eq(tables.id, c.req.param("id")), eq(tables.outletId, outletId)),
  })
  if (!table) return c.json({ error: "Not found" }, 404)
  if (table.status !== "available") return c.json({ error: "Cannot delete a table with an active order" }, 400)
  await db.delete(tables).where(eq(tables.id, c.req.param("id")))
  return c.body(null, 204)
})
