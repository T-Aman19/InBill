import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, inArray } from "drizzle-orm"
import { createBillSchema, addPaymentSchema, applyDiscountSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, billPayments, billDiscounts, discounts, orders, taxConfigs, tables, kots, outlets } from "../db/schema/index.js"
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

  const unsentItems = activeItems.filter((i) => !i.kotId)
  if (unsentItems.length > 0) return c.json({ error: "Send all items to kitchen before billing" }, 400)

  const kotIds = [...new Set(activeItems.map((i) => i.kotId!))]
  const kotList = await db.query.kots.findMany({ where: inArray(kots.id, kotIds) })
  const inKitchen = kotList.some((k) => k.status !== "done")
  if (inKitchen) return c.json({ error: "Items are still being prepared in the kitchen" }, 400)

  // Build per-item tax lines grouped by rate
  const menuItemIds = [...new Set(activeItems.map((i) => i.menuItemId).filter(Boolean) as string[])]
  const menuItemTaxMap = new Map<string, { cgstRate: number; sgstRate: number }>()

  if (menuItemIds.length > 0) {
    const itemsWithTax = await db.query.menuItems.findMany({
      where: (m, { inArray }) => inArray(m.id, menuItemIds),
      with: { taxConfig: true },
    })
    for (const item of itemsWithTax) {
      if (item.taxConfig) {
        menuItemTaxMap.set(item.id, {
          cgstRate: Number(item.taxConfig.cgstRate),
          sgstRate: Number(item.taxConfig.sgstRate),
        })
      }
    }
  }

  // Fall back to outlet-wide tax config for items without a per-item config
  const outletTaxConfig = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })
  const outletRates = outletTaxConfig
    ? { cgstRate: Number(outletTaxConfig.cgstRate), sgstRate: Number(outletTaxConfig.sgstRate) }
    : null

  // Accumulate tax per rate bucket: key = "cgst:sgst"
  const taxBuckets = new Map<string, { cgstRate: number; sgstRate: number; taxableAmount: number }>()
  let subtotal = 0

  for (const item of activeItems) {
    const modTotal = item.modifiers.reduce((s, m) => s + Number(m.price), 0)
    const lineTotal = (Number(item.unitPrice) + modTotal) * item.quantity
    subtotal += lineTotal

    const rates = (item.menuItemId ? menuItemTaxMap.get(item.menuItemId) : null) ?? outletRates
    if (rates && (rates.cgstRate > 0 || rates.sgstRate > 0)) {
      const key = `${rates.cgstRate}:${rates.sgstRate}`
      const bucket = taxBuckets.get(key) ?? { cgstRate: rates.cgstRate, sgstRate: rates.sgstRate, taxableAmount: 0 }
      bucket.taxableAmount += lineTotal
      taxBuckets.set(key, bucket)
    }
  }

  const taxLines: { name: string; rate: number; amount: number }[] = []
  let taxTotal = 0

  for (const bucket of taxBuckets.values()) {
    if (bucket.cgstRate > 0) {
      const amount = parseFloat(((bucket.taxableAmount * bucket.cgstRate) / 100).toFixed(2))
      taxLines.push({ name: "CGST", rate: bucket.cgstRate, amount })
      taxTotal += amount
    }
    if (bucket.sgstRate > 0) {
      const amount = parseFloat(((bucket.taxableAmount * bucket.sgstRate) / 100).toFixed(2))
      taxLines.push({ name: "SGST", rate: bucket.sgstRate, amount })
      taxTotal += amount
    }
  }

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
    with: { payments: true, discountLines: true, order: { with: { items: { with: { modifiers: true } } } } },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  const items = (bill.order?.items ?? [])
    .filter((i) => !i.isVoided)
    .map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      modifiers: i.modifiers.map((m) => ({ name: m.name, price: m.price })),
    }))
  const { order: _, ...rest } = bill
  return c.json({ ...rest, items })
})

// Apply a discount to an unpaid bill that has no payments yet
billingRouter.patch("/:id/discount", requireRole("owner", "manager", "cashier"), zValidator("json", applyDiscountSchema), async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")
  const { discountId, code, label, amount } = c.req.valid("json")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true, discountLines: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Cannot modify a paid bill" }, 400)
  if (bill.payments.length > 0) return c.json({ error: "Cannot add discount after payment has started" }, 400)

  // If referencing a discount preset, validate it
  if (discountId) {
    const preset = await db.query.discounts.findFirst({
      where: and(eq(discounts.id, discountId), eq(discounts.outletId, outletId), eq(discounts.isActive, true)),
    })
    if (!preset) return c.json({ error: "Discount not found or inactive" }, 404)
    const now = new Date()
    if (preset.validTo && new Date(preset.validTo) < now) return c.json({ error: "Discount has expired" }, 400)
    if (preset.usageLimit !== null && preset.usageCount >= preset.usageLimit) return c.json({ error: "Usage limit reached" }, 400)
  }

  // If applying by code, look up and validate
  let resolvedDiscountId = discountId ?? null
  if (!resolvedDiscountId && code) {
    const preset = await db.query.discounts.findFirst({
      where: and(eq(discounts.outletId, outletId), eq(discounts.code, code), eq(discounts.isActive, true)),
    })
    if (!preset) return c.json({ error: "Invalid coupon code" }, 404)
    resolvedDiscountId = preset.id
  }

  // Insert discount line
  const [line] = await db.insert(billDiscounts).values({ billId, discountId: resolvedDiscountId, label, amount: String(amount) }).returning()

  // Recompute discountAmount and total from all discount lines
  const allLines = [...bill.discountLines, line]
  const totalDiscount = allLines.reduce((s, l) => s + Number(l?.amount ?? 0), 0)
  const newTotal = Number(bill.subtotal) + Number(bill.taxTotal) - totalDiscount

  await db.update(bills).set({
    discountAmount: String(totalDiscount.toFixed(2)),
    total: String(Math.max(0, newTotal).toFixed(2)),
  }).where(eq(bills.id, billId))

  // Increment usageCount on the discount preset
  if (resolvedDiscountId) {
    await db.update(discounts).set({ usageCount: (await db.query.discounts.findFirst({ where: eq(discounts.id, resolvedDiscountId) }))!.usageCount + 1 }).where(eq(discounts.id, resolvedDiscountId))
  }

  const updatedBill = await db.query.bills.findFirst({
    where: eq(bills.id, billId),
    with: { payments: true, discountLines: true },
  })
  return c.json(updatedBill)
})

// Remove a discount line from an unpaid bill with no payments
billingRouter.delete("/:id/discount/:lineId", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")
  const lineId = c.req.param("lineId")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true, discountLines: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Cannot modify a paid bill" }, 400)
  if (bill.payments.length > 0) return c.json({ error: "Cannot remove discount after payment has started" }, 400)

  const line = bill.discountLines.find((l) => l.id === lineId)
  if (!line) return c.json({ error: "Discount line not found" }, 404)

  await db.delete(billDiscounts).where(eq(billDiscounts.id, lineId))

  const remaining = bill.discountLines.filter((l) => l.id !== lineId)
  const totalDiscount = remaining.reduce((s, l) => s + Number(l.amount), 0)
  const newTotal = Number(bill.subtotal) + Number(bill.taxTotal) - totalDiscount

  await db.update(bills).set({
    discountAmount: String(totalDiscount.toFixed(2)),
    total: String(Math.max(0, newTotal).toFixed(2)),
  }).where(eq(bills.id, billId))

  return c.json({ ok: true })
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

    const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) })
    if (order?.tableId) {
      await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
      broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
    }
  }

  return c.json(payment, 201)
})

// Initiate UPI payment — returns a UPI deeplink (rendered as QR on client) or Razorpay order
billingRouter.post("/:id/payments/upi", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Already paid" }, 400)

  const paidSoFar = bill.payments.reduce((s, p) => s + Number(p.amount), 0)
  const amountDue = Math.max(0, Number(bill.total) - paidSoFar)
  if (amountDue <= 0) return c.json({ error: "Nothing due" }, 400)

  const outlet = await db.query.outlets.findFirst({ where: eq(outlets.id, outletId) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const gatewayOrderId = `upi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let qrData: string
  let mode: "razorpay" | "upi_direct" | "stub" = "stub"

  if (outlet.razorpayKeyId && outlet.razorpayKeySecret) {
    // TODO: call Razorpay Payment Links API here when account is ready
    // For now, fall through to UPI direct if VPA is available, otherwise stub
    mode = "razorpay"
    qrData = outlet.upiVpa
      ? `upi://pay?pa=${outlet.upiVpa}&pn=${encodeURIComponent(outlet.name)}&am=${amountDue.toFixed(2)}&cu=INR&tr=${gatewayOrderId}`
      : `RAZORPAY_STUB:${gatewayOrderId}:${amountDue}`
  } else if (outlet.upiVpa) {
    mode = "upi_direct"
    qrData = `upi://pay?pa=${outlet.upiVpa}&pn=${encodeURIComponent(outlet.name)}&am=${amountDue.toFixed(2)}&cu=INR&tr=${gatewayOrderId}`
  } else {
    // No payment config — return a stub so the UI can still demonstrate the flow
    mode = "stub"
    qrData = `STUB:${gatewayOrderId}:${amountDue}`
  }

  const payments = await db
    .insert(billPayments)
    .values({ billId, mode: "upi", amount: String(amountDue.toFixed(2)), gatewayOrderId, gatewayStatus: "pending" })
    .returning()
  const payment = payments[0]
  if (!payment) return c.json({ error: "Failed to create payment record" }, 500)

  return c.json({ paymentId: payment.id, qrData, amountDue, mode, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
})

// Poll payment status
billingRouter.get("/:id/payments/:paymentId/status", async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")
  const paymentId = c.req.param("paymentId")

  const bill = await db.query.bills.findFirst({ where: and(eq(bills.id, billId), eq(bills.outletId, outletId)) })
  if (!bill) return c.json({ error: "Not found" }, 404)

  const payment = await db.query.billPayments.findFirst({ where: and(eq(billPayments.id, paymentId), eq(billPayments.billId, billId)) })
  if (!payment) return c.json({ error: "Payment not found" }, 404)

  return c.json({ status: payment.gatewayStatus ?? "pending", isPaid: bill.isPaid })
})

// Cancel a pending UPI payment (e.g. user dismissed the QR modal)
billingRouter.delete("/:id/payments/:paymentId", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const billId    = c.req.param("id")
  const paymentId = c.req.param("paymentId")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Cannot modify a paid bill" }, 400)

  const payment = await db.query.billPayments.findFirst({
    where: and(eq(billPayments.id, paymentId), eq(billPayments.billId, billId)),
  })
  if (!payment) return c.json({ error: "Payment not found" }, 404)
  if (payment.mode !== "upi" || payment.gatewayStatus !== "pending")
    return c.json({ error: "Can only cancel pending UPI payments" }, 400)

  await db.delete(billPayments).where(eq(billPayments.id, paymentId))
  return c.json({ ok: true })
})

// Simulate payment success (testing / stub mode)
billingRouter.patch("/:id/payments/:paymentId/simulate", requireRole("owner", "manager", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("id")
  const paymentId = c.req.param("paymentId")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Already paid" }, 400)

  const payment = await db.query.billPayments.findFirst({ where: and(eq(billPayments.id, paymentId), eq(billPayments.billId, billId)) })
  if (!payment) return c.json({ error: "Payment not found" }, 404)
  if (payment.gatewayStatus === "success") return c.json({ error: "Already confirmed" }, 400)

  await db.update(billPayments).set({ gatewayStatus: "success" }).where(eq(billPayments.id, paymentId))

  const paidSoFar = bill.payments.reduce((s, p) => s + Number(p.amount), 0)
  if (paidSoFar >= Number(bill.total)) {
    await db.update(bills).set({ isPaid: true }).where(eq(bills.id, billId))
    const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) })
    if (order?.tableId) {
      await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
      broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
    }
    broadcastOutlet(outletId, { type: "payment.confirmed", payload: { billId, paymentId } })
  }

  return c.json({ ok: true, isPaid: paidSoFar >= Number(bill.total) })
})

