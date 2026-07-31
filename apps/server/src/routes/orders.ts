import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, isNull, inArray, gte, max } from "drizzle-orm"
import { z } from "zod"
import { createOrderSchema, addOrderItemSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { orders, orderItems, orderItemModifiers, tables, menuItems, itemVariants, kots, voidedItems, bills, queueEntries, customers, reservations, categories, menuSchedules, modifiers, modifierGroups, menuItemModifierGroups } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"
import { logAudit } from "../services/audit.js"
import { isScheduleActiveNow } from "../lib/schedule.js"
import { fetchOrderWithKotStatus } from "../lib/queries.js"

export const ordersRouter = new Hono<AppEnv>()

ordersRouter.use("*", requireAuth)

const transferSchema = z.object({ newTableId: z.string().uuid() })
const mergeSchema = z.object({ sourceOrderId: z.string().uuid() })
const linkCustomerSchema = z.object({ customerId: z.string().uuid() })

ordersRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const openOrders = await db.query.orders.findMany({
    where: and(eq(orders.outletId, outletId), eq(orders.status, "open")),
    with: { items: { with: { modifiers: true } } },
  })
  return c.json(openOrders)
})

// Active counter orders (takeaway/delivery) — shown on the FloorPage counter panel
ordersRouter.get("/counter", async (c) => {
  const { outletId } = c.get("user")

  // Only show orders from the last 12 hours so the panel doesn't fill with old entries
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000)

  const counterOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.outletId, outletId),
      inArray(orders.type, ["takeaway", "delivery"]),
      inArray(orders.status, ["open", "kot_sent", "served", "billed"]),
      gte(orders.createdAt, since),
    ),
    with: { items: { where: (i, { eq }) => eq(i.isVoided, false) } },
    orderBy: (o, { desc }) => [desc(o.createdAt)],
  })

  if (counterOrders.length === 0) return c.json([])

  // Attach bill payment status for billed orders
  const billedIds = counterOrders.filter((o) => o.status === "billed").map((o) => o.id)
  const billMap = new Map<string, { isPaid: boolean; total: string; id: string }>()
  if (billedIds.length > 0) {
    const billRows = await db.query.bills.findMany({
      where: and(eq(bills.outletId, outletId), inArray(bills.orderId, billedIds)),
      columns: { orderId: true, isPaid: true, total: true, id: true },
    })
    for (const b of billRows) billMap.set(b.orderId, { isPaid: b.isPaid, total: b.total, id: b.id })
  }

  const result = counterOrders
    .filter((o) => o.items.length > 0)
    .map((o) => {
      const bill = billMap.get(o.id) ?? null
      return { ...o, bill }
    })

  return c.json(result)
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
    if (table && table.status !== "available" && table.status !== "reserved") {
      return c.json({ error: "Table is not available" }, 400)
    }
  }

  // If no customer supplied but the table is reserved, inherit the customer from the seated queue entry
  let customerId = data.customerId ?? null
  if (data.tableId && !customerId) {
    // Inherit from the most-recent seated entry for this table (scoped to the
    // outlet) so a reused table can't attribute the order to an earlier guest.
    const seatedEntry = await db.query.queueEntries.findFirst({
      where: and(
        eq(queueEntries.outletId, outletId),
        eq(queueEntries.tableId, data.tableId),
        eq(queueEntries.status, "seated"),
      ),
      orderBy: (q, { desc }) => [desc(q.seatedAt)],
      columns: { customerId: true },
    })
    if (seatedEntry?.customerId) customerId = seatedEntry.customerId

    // Seated reservations carry their guest onto the order the same way
    if (!customerId) {
      const seatedReservation = await db.query.reservations.findFirst({
        where: and(
          eq(reservations.outletId, outletId),
          eq(reservations.tableId, data.tableId),
          eq(reservations.status, "seated"),
        ),
        orderBy: (r, { desc }) => [desc(r.reservedFor)],
        columns: { customerId: true },
      })
      if (seatedReservation?.customerId) customerId = seatedReservation.customerId
    }
  }

  const [order] = await db
    .insert(orders)
    .values({ ...data, customerId, outletId, serverId: userId, updatedAt: new Date() })
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

  // Validate item belongs to this outlet
  const item = await db.query.menuItems.findFirst({
    where: and(eq(menuItems.id, data.menuItemId), eq(menuItems.outletId, outletId)),
  })
  if (!item) return c.json({ error: "Item not found" }, 404)

  // Schedule gate: item's own schedule wins, else its category's. Outside the
  // window the item can't be ordered; inside, a percentOff schedule reprices it.
  let effectiveScheduleId = item.scheduleId
  if (!effectiveScheduleId) {
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, item.categoryId), columns: { scheduleId: true },
    })
    effectiveScheduleId = category?.scheduleId ?? null
  }
  let percentOff = 0
  if (effectiveScheduleId) {
    const schedule = await db.query.menuSchedules.findFirst({ where: eq(menuSchedules.id, effectiveScheduleId) })
    if (schedule && schedule.isActive) {
      if (!isScheduleActiveNow(schedule)) {
        return c.json({ error: `"${item.name}" is only available during ${schedule.name} (${schedule.startTime}–${schedule.endTime})` }, 400)
      }
      percentOff = Number(schedule.percentOff)
    }
  }

  let unitPrice = Number(item.basePrice)
  let variantName: string | null = null

  if (data.variantId) {
    const variant = await db.query.itemVariants.findFirst({ where: eq(itemVariants.id, data.variantId) })
    if (variant) { unitPrice = Number(variant.price); variantName = variant.name }
  }

  if (percentOff > 0) unitPrice = Number((unitPrice * (1 - percentOff / 100)).toFixed(2))

  // A line's identity includes its modifier set: "Paneer" and "Paneer + Extra
  // Cheese" are distinct lines and must never merge — merging silently dropped
  // the add-on and its price from the KOT and the bill. Dedupe on
  // menuItem + variant + the sorted modifier-id set, compared in memory because
  // modifiers live in a sibling table and can't be expressed as one WHERE.
  const wantModKey = [...new Set(data.modifiers)].sort().join(",")
  const candidates = await db.query.orderItems.findMany({
    where: and(
      eq(orderItems.orderId, orderId),
      eq(orderItems.menuItemId, data.menuItemId),
      data.variantId ? eq(orderItems.variantId, data.variantId) : isNull(orderItems.variantId),
      isNull(orderItems.kotId),
      eq(orderItems.isVoided, false),
    ),
    with: { modifiers: true },
  })
  const existing = candidates.find(
    (line) => [...new Set(line.modifiers.map((m) => m.modifierId))].sort().join(",") === wantModKey,
  )

  let orderItem: typeof orderItems.$inferSelect
  if (existing) {
    // Same item + variant + modifier set already on the order → bump quantity.
    // The modifiers are already snapshotted on this line (and were validated
    // when it was first created), so we don't re-resolve them here — that also
    // lets the quantity "+" button work even if a modifier was later deactivated.
    const newQty = existing.quantity + (data.quantity ?? 1)
    if (newQty > 999) return c.json({ error: "Quantity cannot exceed 999" }, 400)
    const [updated] = await db
      .update(orderItems)
      .set({ quantity: newQty })
      .where(eq(orderItems.id, existing.id))
      .returning()
    orderItem = updated!
  } else {
    // New line. Resolve & validate the submitted modifiers against THIS item's
    // linked, active groups within this outlet. The old lookup was an unscoped
    // findMany() filtered client-side, which let a client attach ANY modifier
    // UUID in the database — cross-tenant, inactive, or from an unrelated item —
    // at its price. Anything that doesn't resolve to an allowed modifier is
    // rejected (a well-behaved client never submits one).
    const selectedMods: { id: string; name: string; price: string }[] = []
    if (data.modifiers.length > 0) {
      const allowed = await db
        .select({ id: modifiers.id, name: modifiers.name, price: modifiers.price })
        .from(modifiers)
        .innerJoin(modifierGroups, eq(modifiers.groupId, modifierGroups.id))
        .innerJoin(menuItemModifierGroups, eq(menuItemModifierGroups.groupId, modifierGroups.id))
        .where(
          and(
            inArray(modifiers.id, data.modifiers),
            eq(menuItemModifierGroups.itemId, data.menuItemId),
            eq(modifierGroups.outletId, outletId),
            eq(modifiers.isActive, true),
          ),
        )
      const byId = new Map(allowed.map((m) => [m.id, m]))
      for (const id of data.modifiers) {
        if (!byId.has(id)) return c.json({ error: "Invalid modifier for this item" }, 400)
      }
      selectedMods.push(...byId.values())
    }

    const [inserted] = await db
      .insert(orderItems)
      .values({ orderId, menuItemId: data.menuItemId, variantId: data.variantId ?? null, name: item.name, variantName, unitPrice: String(unitPrice), quantity: data.quantity, notes: data.notes })
      .returning()
    orderItem = inserted!
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

// If all items on an order are voided, cancel the order and free its table.
// This also applies when items had already been sent to the kitchen (guests
// walked out): voids are recorded in voidedItems for reporting, and the
// kitchen's now-empty KOTs are marked done so they leave the KDS. Without
// this, a fully-voided order stayed open forever with its table stuck
// occupied and billing blocked ("Order has no items").
async function maybeAutoCancel(orderId: string, outletId: string) {
  const allItems = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) })
  if (allItems.length === 0) return
  const anyActive = allItems.some((i) => !i.isVoided)
  if (anyActive) return

  // Clear any kitchen tickets that now contain only voided items
  const kotIds = [...new Set(allItems.map((i) => i.kotId).filter((id): id is string => id !== null))]
  if (kotIds.length > 0) {
    await db.update(kots).set({ status: "done" }).where(inArray(kots.id, kotIds))
    for (const kotId of kotIds) {
      broadcastOutlet(outletId, { type: "kot.done", payload: { kotId } })
    }
  }

  await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId))

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (order?.tableId) {
    await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
  }

  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
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
    logAudit({
      outletId, userId, action: "order_item.void", entity: "order", entityId: orderId,
      details: { itemName: item.name, qty: item.quantity, unitPrice: Number(item.unitPrice) },
    })
  }
  await maybeAutoCancel(orderId, outletId)

  broadcastOutlet(outletId, { type: "order.updated", payload: await fetchOrderWithKotStatus(orderId) as never })
  return c.body(null, 204)
})

// Link a customer to an existing order (used when customer details are collected at billing time)
ordersRouter.patch("/:id/customer", requireRole("owner", "manager", "cashier", "captain"), zValidator("json", linkCustomerSchema), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")
  const { customerId } = c.req.valid("json")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  // Ensure the customer belongs to this outlet before linking
  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.outletId, outletId)),
    columns: { id: true },
  })
  if (!customer) return c.json({ error: "Customer not found" }, 404)

  await db.update(orders).set({ customerId, updatedAt: new Date() }).where(eq(orders.id, orderId))
  return c.json({ ok: true })
})

// Transfer order to a different table
ordersRouter.patch("/:id/transfer", requireRole("owner", "manager", "cashier"), zValidator("json", transferSchema), async (c) => {
  const { outletId } = c.get("user")
  const orderId = c.req.param("id")
  const { newTableId } = c.req.valid("json")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
  })
  if (!order) return c.json({ error: "Not found" }, 404)

  // Validate target table belongs to same outlet
  const newTable = await db.query.tables.findFirst({ where: and(eq(tables.id, newTableId), eq(tables.outletId, outletId)) })
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
ordersRouter.post("/:id/merge", requireRole("owner", "manager", "cashier"), zValidator("json", mergeSchema), async (c) => {
  const { outletId } = c.get("user")
  const targetOrderId = c.req.param("id")
  const { sourceOrderId } = c.req.valid("json")

  if (sourceOrderId === targetOrderId) {
    return c.json({ error: "Cannot merge an order with itself" }, 400)
  }

  const [targetOrder, sourceOrder] = await Promise.all([
    db.query.orders.findFirst({ where: and(eq(orders.id, targetOrderId), eq(orders.outletId, outletId)) }),
    db.query.orders.findFirst({ where: and(eq(orders.id, sourceOrderId), eq(orders.outletId, outletId)) }),
  ])
  if (!targetOrder || !sourceOrder) return c.json({ error: "Order not found" }, 404)
  if (sourceOrder.status === "cancelled" || sourceOrder.status === "billed") {
    return c.json({ error: "Source order is already closed" }, 400)
  }

  // Re-parent all source items — and their KOTs — to the target order so the
  // kitchen tickets and order status stay consistent after the merge.
  await db.update(orderItems).set({ orderId: targetOrderId }).where(eq(orderItems.orderId, sourceOrderId))
  await db.update(kots).set({ orderId: targetOrderId }).where(eq(kots.orderId, sourceOrderId))

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

  const [kotAgg] = await db.select({ maxNum: max(kots.kotNumber) }).from(kots).where(eq(kots.outletId, outletId))
  const kotNumber = (kotAgg?.maxNum ?? 0) + 1

  const [kot] = await db.insert(kots).values({ outletId, orderId, kotNumber }).returning()
  if (!kot) return c.json({ error: "Failed to create KOT" }, 500)

  await db.update(orderItems).set({ kotId: kot.id }).where(and(eq(orderItems.orderId, orderId), isNull(orderItems.kotId), eq(orderItems.isVoided, false)))
  await db.update(orders).set({ status: "kot_sent", updatedAt: new Date() }).where(eq(orders.id, orderId))

  const kotWithItems = { ...kot, items: unsentItems }

  broadcastOutlet(outletId, { type: "kot.new", payload: kotWithItems as never })
  return c.json(kotWithItems, 201)
})