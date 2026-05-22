import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, isNull } from "drizzle-orm"
import { createOrderSchema, addOrderItemSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { orders, orderItems, orderItemModifiers, tables, menuItems, itemVariants, kots, voidedItems } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"
import { fetchOrderWithKotStatus } from "../lib/queries.js"

export const ordersRouter = new Hono<AppEnv>()

ordersRouter.use("*", requireAuth)

ordersRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const openOrders = await db.query.orders.findMany({
    where: and(eq(orders.outletId, outletId), eq(orders.status, "open")),
    with: { items: { with: { modifiers: true } } },
  })
  return c.json(openOrders)
})

ordersRouter.get("/:id", async (c) => {
  const { outletId } = c.get("user")
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, c.req.param("id")), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)
  return c.json(await fetchOrderWithKotStatus(c.req.param("id")))
})

ordersRouter.post("/", requireRole("owner", "manager", "cashier", "captain"), zValidator("json", createOrderSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const data = c.req.valid("json")

  if (data.tableId) {
    const table = await db.query.tables.findFirst({ where: eq(tables.id, data.tableId) })
    if (table && table.status !== "available") {
      return c.json({ error: "Table is not available" }, 400)
    }
  }

  const [order] = await db
    .insert(orders)
    .values({ ...data, outletId, serverId: userId, updatedAt: new Date() })
    .returning()

  if (order && data.tableId) {
    await db.update(tables).set({ status: "occupied", currentOrderId: order.id }).where(eq(tables.id, data.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: data.tableId, status: "occupied", currentOrderId: order.id } })
  }

  broadcastOutlet(outletId, { type: "order.created", payload: order as never })
  return c.json(order, 201)
})

ordersRouter.post("/:id/items", requireRole("owner", "manager", "cashier", "captain"), zValidator("json", addOrderItemSchema), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")
  const data = c.req.valid("json")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)
  if (order.status === "cancelled" || order.status === "billed") {
    return c.json({ error: "Order is closed" }, 400)
  }

  // Snapshot item/variant name and price at time of order
  const item = await db.query.menuItems.findFirst({ where: eq(menuItems.id, data.menuItemId) })
  if (!item) return c.json({ error: "Item not found" }, 404)

  let unitPrice = Number(item.basePrice)
  let variantName: string | null = null

  if (data.variantId) {
    const variant = await db.query.itemVariants.findFirst({ where: eq(itemVariants.id, data.variantId) })
    if (variant) { unitPrice = Number(variant.price); variantName = variant.name }
  }

  // If the same item (same variant, no KOT yet, not voided) already exists, increment quantity
  const existing = await db.query.orderItems.findFirst({
    where: and(
      eq(orderItems.orderId, orderId),
      eq(orderItems.menuItemId, data.menuItemId),
      data.variantId ? eq(orderItems.variantId, data.variantId) : isNull(orderItems.variantId),
      isNull(orderItems.kotId),
      eq(orderItems.isVoided, false),
    ),
  })

  let orderItem: typeof orderItems.$inferSelect
  if (existing) {
    const [updated] = await db
      .update(orderItems)
      .set({ quantity: existing.quantity + (data.quantity ?? 1) })
      .where(eq(orderItems.id, existing.id))
      .returning()
    orderItem = updated!
  } else {
    const [inserted] = await db
      .insert(orderItems)
      .values({ orderId, menuItemId: data.menuItemId, variantId: data.variantId ?? null, name: item.name, variantName, unitPrice: String(unitPrice), quantity: data.quantity, notes: data.notes })
      .returning()
    orderItem = inserted!
  }

  if (orderItem && !existing && data.modifiers.length > 0) {
    const modList = await db.query.modifiers.findMany()
    const selectedMods = modList.filter((m) => data.modifiers.includes(m.id))
    if (selectedMods.length > 0) {
      await db.insert(orderItemModifiers).values(
        selectedMods.map((m) => ({ orderItemId: orderItem.id, modifierId: m.id, name: m.name, price: m.price })),
      )
    }
  }

  await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, orderId))

  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
  return c.json(orderItem, 201)
})

// If all items on an order are voided and none were ever sent to kitchen, cancel + free table
async function maybeAutoCancel(orderId: string, outletId: string) {
  const allItems = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) })
  if (allItems.length === 0) return
  const anyActive = allItems.some((i) => !i.isVoided)
  if (anyActive) return
  const anySentToKitchen = allItems.some((i) => i.kotId !== null)
  if (anySentToKitchen) return

  await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId))

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (order?.tableId) {
    await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
  }
}

// Decrement pending item qty by 1; void if qty reaches 0
ordersRouter.patch("/:id/items/:itemId/decrement", requireRole("owner", "manager", "cashier", "captain"), async (c) => {
  const { outletId } = c.get("user")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, c.req.param("id")), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  const item = await db.query.orderItems.findFirst({
    where: and(eq(orderItems.id, c.req.param("itemId")), isNull(orderItems.kotId), eq(orderItems.isVoided, false)),
  })
  if (!item) return c.json({ error: "Item not found or already sent" }, 404)

  const orderId = c.req.param("id")
  if (item.quantity <= 1) {
    await db.update(orderItems).set({ isVoided: true }).where(eq(orderItems.id, item.id))
    await db.insert(voidedItems).values({
      outletId,
      orderId,
      orderItemId: item.id,
      itemName: item.name,
      qty: 1,
      unitPrice: item.unitPrice,
      voidedById: c.get("user").userId,
    })
  } else {
    await db.update(orderItems).set({ quantity: item.quantity - 1 }).where(eq(orderItems.id, item.id))
  }

  await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, orderId))
  await maybeAutoCancel(orderId, outletId)

  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
  return c.body(null, 204)
})

ordersRouter.delete("/:id/items/:itemId", requireRole("manager", "owner", "cashier"), async (c) => {
  const { outletId, userId } = c.get("user")
  const orderId = c.req.param("id")
  const itemId = c.req.param("itemId")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, itemId) })
  await db.update(orderItems).set({ isVoided: true }).where(eq(orderItems.id, itemId))
  if (item && !item.isVoided) {
    await db.insert(voidedItems).values({
      outletId,
      orderId,
      orderItemId: item.id,
      itemName: item.name,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      voidedById: userId,
    })
  }
  await maybeAutoCancel(orderId, outletId)

  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
  return c.body(null, 204)
})

// Link a customer to an existing order (used when customer details are collected at billing time)
ordersRouter.patch("/:id/customer", requireRole("owner", "manager", "cashier", "captain"), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")
  const { customerId } = await c.req.json() as { customerId: string }

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  await db.update(orders).set({ customerId, updatedAt: new Date() }).where(eq(orders.id, orderId))
  return c.json({ ok: true })
})

// Transfer order to a different table
ordersRouter.patch("/:id/transfer", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")
  const { newTableId } = await c.req.json() as { newTableId: string }

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  const newTable = await db.query.tables.findFirst({ where: eq(tables.id, newTableId) })
  if (!newTable) return c.json({ error: "Target table not found" }, 404)
  if (newTable.status !== "available") return c.json({ error: "Target table is not available" }, 400)

  // Free old table if any
  if (order.tableId) {
    await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
  }

  // Occupy new table
  await db.update(tables).set({ status: "occupied", currentOrderId: orderId }).where(eq(tables.id, newTableId))
  broadcastOutlet(outletId, { type: "table.status", payload: { id: newTableId, status: "occupied", currentOrderId: orderId } })

  const [updated] = await db.update(orders).set({ tableId: newTableId, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning()
  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
  return c.json(updated)
})

// Merge sourceOrder into targetOrder (moves items, frees source table, cancels source order)
ordersRouter.post("/:id/merge", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const targetOrderId = c.req.param("id")
  const { sourceOrderId } = await c.req.json() as { sourceOrderId: string }

  const [targetOrder, sourceOrder] = await Promise.all([
    db.query.orders.findFirst({ where: and(eq(orders.id, targetOrderId), eq(orders.outletId, outletId)) }),
    db.query.orders.findFirst({ where: and(eq(orders.id, sourceOrderId), eq(orders.outletId, outletId)) }),
  ])
  if (!targetOrder || !sourceOrder) return c.json({ error: "Order not found" }, 404)
  if (sourceOrder.status === "cancelled" || sourceOrder.status === "billed") {
    return c.json({ error: "Source order is already closed" }, 400)
  }

  // Re-parent all source items to target order
  await db.update(orderItems).set({ orderId: targetOrderId }).where(eq(orderItems.orderId, sourceOrderId))

  // Cancel source order and free its table
  await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, sourceOrderId))
  if (sourceOrder.tableId) {
    await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, sourceOrder.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: sourceOrder.tableId, status: "available", currentOrderId: null } })
  }

  await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, targetOrderId))
  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(targetOrderId) as never })
  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(sourceOrderId) as never })
  return c.json(await fetchOrderWithKotStatus(targetOrderId))
})

// Generate a KOT for all unsent items on an order
ordersRouter.post("/:id/kot", requireRole("owner", "manager", "cashier", "captain"), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  const unsentItems = await db.query.orderItems.findMany({
    where: and(eq(orderItems.orderId, orderId), isNull(orderItems.kotId), eq(orderItems.isVoided, false)),
    with: { modifiers: true },
  })

  if (unsentItems.length === 0) return c.json({ error: "No new items to send" }, 400)

  const existingKots = await db.query.kots.findMany({ where: eq(kots.outletId, outletId) })
  const kotNumber = existingKots.length + 1

  const [kot] = await db.insert(kots).values({ outletId, orderId, kotNumber }).returning()
  if (!kot) return c.json({ error: "Failed to create KOT" }, 500)

  await db.update(orderItems).set({ kotId: kot.id }).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.kotId), eq(orderItems.isVoided, false)))
  await db.update(orders).set({ status: "kot_sent", updatedAt: new Date() }).where(eq(orders.id, orderId))

  const kotWithItems = { ...kot, items: unsentItems }

  broadcastOutlet(outletId, { type: "kot.new", payload: kotWithItems as never })
  return c.json(kotWithItems, 201)
})
