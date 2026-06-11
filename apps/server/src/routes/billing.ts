import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, inArray, isNull } from "drizzle-orm"
import { createBillSchema, addPaymentSchema, applyDiscountSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, billPayments, billDiscounts, discounts, orders, orderItems, taxConfigs, tables, kots, outlets, ingredients, stockMovements, loyaltyPrograms, customerPoints, pointTransactions, customers } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"

export const billingRouter = new Hono<AppEnv>()

async function awardLoyaltyPoints(outletId: string, billId: string, billTotal: number, orderId: string) {
  const program = await db.query.loyaltyPrograms.findFirst({
    where: and(eq(loyaltyPrograms.outletId, outletId), eq(loyaltyPrograms.isActive, true)),
  })
  if (!program) return

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), columns: { customerId: true } })
  if (!order?.customerId) return

  const points = Math.floor(billTotal * Number(program.pointsPerRupee))
  if (points <= 0) return

  const existing = await db.query.customerPoints.findFirst({
    where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, order.customerId)),
  })

  let newTotal: number
  if (existing) {
    newTotal              = existing.totalPoints    + points
    const newLifetime     = existing.lifetimePoints + points
    const tier = newLifetime >= 10000 ? "gold" : newLifetime >= 3000 ? "silver" : "bronze"
    await db.update(customerPoints)
      .set({ totalPoints: newTotal, lifetimePoints: newLifetime, tier, updatedAt: new Date() })
      .where(eq(customerPoints.id, existing.id))
  } else {
    newTotal = points
    const tier = points >= 10000 ? "gold" : points >= 3000 ? "silver" : "bronze"
    await db.insert(customerPoints).values({
      outletId, customerId: order.customerId,
      totalPoints: points, lifetimePoints: points, tier,
    })
  }

  await db.update(customers).set({ loyaltyPoints: newTotal }).where(eq(customers.id, order.customerId))

  await db.insert(pointTransactions).values({
    outletId,
    customerId: order.customerId,
    delta: points,
    type: "earn",
    billId,
    note: `Earned ${points} pts on ₹${billTotal.toFixed(2)} bill`,
  })
}

billingRouter.use("*", requireAuth)

// ── Inventory auto-deduction helper ──────────────────────────────────────────

async function deductInventoryForBill(
  outletId: string,
  billId: string,
  activeItems: { menuItemId: string | null; quantity: number }[],
  recordedById: string,
) {
  const menuItemIds = [...new Set(activeItems.map((i) => i.menuItemId).filter(Boolean) as string[])]
  if (menuItemIds.length === 0) return

  const recipeRows = await db.query.recipes.findMany({
    where: (r, { inArray }) => inArray(r.menuItemId, menuItemIds),
    with: { recipeIngredients: { with: { ingredient: true } } },
  })
  if (recipeRows.length === 0) return

  const recipeByItemId = new Map(recipeRows.map((r) => [r.menuItemId, r]))

  // Accumulate total deduction per ingredient
  const deductions = new Map<string, number>()
  for (const item of activeItems) {
    if (!item.menuItemId) continue
    const recipe = recipeByItemId.get(item.menuItemId)
    if (!recipe) continue
    for (const ri of recipe.recipeIngredients) {
      const prev = deductions.get(ri.ingredientId) ?? 0
      deductions.set(ri.ingredientId, prev + Number(ri.quantity) * item.quantity)
    }
  }

  for (const [ingredientId, delta] of deductions) {
    const ingredient = await db.query.ingredients.findFirst({ where: eq(ingredients.id, ingredientId) })
    if (!ingredient) continue

    const newStock = Number(ingredient.currentStock) - delta
    const [updated] = await db
      .update(ingredients)
      .set({ currentStock: String(newStock.toFixed(4)) })
      .where(eq(ingredients.id, ingredientId))
      .returning()

    await db.insert(stockMovements).values({
      outletId,
      ingredientId,
      type: "sale",
      delta: String((-delta).toFixed(4)),
      referenceId: billId,
      referenceType: "bill",
      recordedById,
    })

    if (updated && Number(updated.reorderLevel) > 0 && Number(updated.currentStock) <= Number(updated.reorderLevel)) {
      broadcastOutlet(outletId, {
        type: "inventory.low_stock",
        payload: {
          ingredientId: updated.id,
          name: updated.name,
          currentStock: updated.currentStock,
          unit: updated.unit,
          reorderLevel: updated.reorderLevel,
        },
      })
    }
  }
}

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

  if (order.type === "dine_in") {
    // Table service: food must be ready before billing
    if (unsentItems.length > 0) return c.json({ error: "Send all items to kitchen before billing" }, 400)
    const kotIds = [...new Set(activeItems.map((i) => i.kotId!))]
    const kotList = await db.query.kots.findMany({ where: inArray(kots.id, kotIds) })
    const inKitchen = kotList.some((k) => k.status !== "done")
    if (inKitchen) return c.json({ error: "Items are still being prepared in the kitchen" }, 400)
  } else {
    // Counter order (takeaway/delivery): customer pays first, kitchen prepares after
    // Auto-fire KOT for any unsent items so the kitchen is notified on payment
    if (unsentItems.length > 0) {
      const existingKots = await db.query.kots.findMany({ where: eq(kots.outletId, outletId) })
      const kotNumber = existingKots.length + 1
      const [kot] = await db.insert(kots).values({ outletId, orderId, kotNumber }).returning()
      if (kot) {
        await db
          .update(orderItems)
          .set({ kotId: kot.id })
          .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.kotId), eq(orderItems.isVoided, false)))
        broadcastOutlet(outletId, { type: "kot.new", payload: { ...kot, items: unsentItems } as never })
      }
    }
  }

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

  if (discountAmount > subtotal + taxTotal) {
    return c.json({ error: "Discount cannot exceed the bill total" }, 400)
  }

  const total = subtotal + taxTotal - discountAmount

  const existingBills = await db.query.bills.findMany({ where: eq(bills.outletId, outletId) })
  const billNumber = existingBills.length + 1

  const billRows = await db
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
      createdById: c.get("user").userId,
    })
    .returning()
  const bill = billRows[0]!

  await db.update(orders).set({ status: "billed", updatedAt: new Date() }).where(eq(orders.id, orderId))

  if (order.tableId) {
    await db.update(tables).set({ status: "billed" }).where(eq(tables.id, order.tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "billed", currentOrderId: orderId } })
  }

  // Auto-deduct inventory (non-blocking — failures should not abort billing)
  deductInventoryForBill(outletId, bill.id, activeItems, c.get("user").userId).catch((err) =>
    console.error("[inventory] auto-deduct failed for bill", bill.id, err),
  )

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
  const { order, ...rest } = bill
  return c.json({ ...rest, items, orderType: order?.type ?? null })
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

  const paidSoFar = bill.payments.reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Number(bill.total) - paidSoFar
  if (data.amount > remaining + 0.01) {
    return c.json({ error: `Payment amount exceeds the remaining balance of ₹${remaining.toFixed(2)}` }, 400)
  }

  const [payment] = await db.insert(billPayments).values({ billId, ...data, amount: String(data.amount) }).returning()

  const totalPaid = paidSoFar + data.amount
  if (totalPaid >= Number(bill.total)) {
    await db.update(bills).set({ isPaid: true }).where(eq(bills.id, billId))

    const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) })
    if (order?.tableId) {
      await db.update(tables).set({ status: "available", currentOrderId: null }).where(eq(tables.id, order.tableId))
      broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "available", currentOrderId: null } })
    }

    awardLoyaltyPoints(outletId, billId, Number(bill.total), bill.orderId).catch((err) =>
      console.error("[loyalty] award failed for bill", billId, err),
    )
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
    awardLoyaltyPoints(outletId, billId, Number(bill.total), bill.orderId).catch((err) =>
      console.error("[loyalty] award failed for bill", billId, err),
    )
  }

  return c.json({ ok: true, isPaid: paidSoFar >= Number(bill.total) })
})

