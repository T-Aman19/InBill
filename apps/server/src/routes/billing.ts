import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, inArray } from "drizzle-orm"
import { createBillSchema, addPaymentSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, billPayments, orders, taxConfigs, tables, kots } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"

export const billingRouter = new Hono<AppEnv>()

billingRouter.use("*", requireAuth)

billingRouter.post("/", requireRole("owner", "manager", "cashier"), zValidator("json", createBillSchema), async (c) => {
  const { outletId } = c.get("user")
  const { orderId, discountAmount = 0, discountNote } = c.req.valid("json")

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.outletId, outletId)),
    with: { items: { with: { modifiers: true } } },
  })
  if (!order) return c.json({ error: "Order not found" }, 404)
  if (order.status === "billed" || order.status === "cancelled") {
    return c.json({ error: "Order is already closed" }, 400)
  }

  const activeItems = order.items.filter((i) => !i.isVoided)
  if (activeItems.length === 0) return c.json({ error: "Order has no items" }, 400)

  // Guard: unsent items must be sent to kitchen before billing
  const unsentItems = activeItems.filter((i) => !i.kotId)
  if (unsentItems.length > 0) return c.json({ error: "Send all items to kitchen before billing" }, 400)

  // Guard: all KOTs must be done before billing
  const kotIds = [...new Set(activeItems.map((i) => i.kotId!))]
  const kotList = await db.query.kots.findMany({ where: inArray(kots.id, kotIds) })
  const inKitchen = kotList.some((k) => k.status !== "done")
  if (inKitchen) return c.json({ error: "Items are still being prepared in the kitchen" }, 400)

  // Calculate subtotal
  const subtotal = activeItems.reduce((sum, item) => {
    const modTotal = item.modifiers.reduce((s, m) => s + Number(m.price), 0)
    return sum + (Number(item.unitPrice) + modTotal) * item.quantity
  }, 0)

  // Apply GST — simplified: use outlet default tax config
  const taxConfig = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })
  const cgst = taxConfig ? (subtotal * Number(taxConfig.cgstRate)) / 100 : 0
  const sgst = taxConfig ? (subtotal * Number(taxConfig.sgstRate)) / 100 : 0
  const taxLines = taxConfig
    ? [
        { name: "CGST", rate: Number(taxConfig.cgstRate), amount: cgst },
        { name: "SGST", rate: Number(taxConfig.sgstRate), amount: sgst },
      ]
    : []
  const taxTotal = cgst + sgst
  const total = subtotal + taxTotal - discountAmount

  const existingBills = await db.query.bills.findMany({ where: eq(bills.outletId, outletId) })
  const billNumber = existingBills.length + 1

  const [bill] = await db
    .insert(bills)
    .values({
      outletId,
      orderId,
      billNumber,
      subtotal: String(subtotal.toFixed(2)),
      taxLines,
      taxTotal: String(taxTotal.toFixed(2)),
      discountAmount: String(Number(discountAmount).toFixed(2)),
      discountNote,
      total: String(total.toFixed(2)),
    })
    .returning()

  await db.update(orders).set({ status: "billed", updatedAt: new Date() }).where(eq(orders.id, orderId))

  // Mark table as billed so the floor shows the red pulse
  if (order.tableId) {
    await db.update(tables).set({ status: "billed" }).where(eq(tables.id, order.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "billed", currentOrderId: orderId } })
  }

  return c.json(bill, 201)
})

billingRouter.get("/:id", async (c) => {
  const { outletId } = c.get("user")
  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, c.req.param("id")), eq(bills.outletId, outletId)),
    with: { payments: true, order: { with: { items: true } } },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  const items = (bill.order?.items ?? [])
    .filter((i) => !i.isVoided)
    .map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice }))
  const { order: _, ...rest } = bill
  return c.json({ ...rest, items })
})

billingRouter.post("/:id/payments", zValidator("json", addPaymentSchema), async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")
  const data = c.req.valid("json")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Already paid" }, 400)

  const [payment] = await db.insert(billPayments).values({ billId, ...data, amount: String(data.amount) }).returning()

  const paidSoFar = bill.payments.reduce((s, p) => s + Number(p.amount), 0) + data.amount
  if (paidSoFar >= Number(bill.total)) {
    await db.update(bills).set({ isPaid: true }).where(eq(bills.id, billId))

    // Free up the table
    const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) })
    if (order?.tableId) {
      await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
      broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
    }
  }

  return c.json(payment, 201)
})
