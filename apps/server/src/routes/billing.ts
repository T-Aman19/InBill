import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { eq, and, inArray, isNull, max, gte, lte, count } from "drizzle-orm"
import { createBillSchema, addPaymentSchema, applyDiscountSchema, dateRangeSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { dayStart, dayEnd } from "../lib/dateRange.js"
import { bills, billPayments, billDiscounts, discounts, orders, orderItems, taxConfigs, tables, kots, outlets, ingredients, stockMovements, loyaltyPrograms, customerPoints, pointTransactions, customers } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"
import { logAudit } from "../services/audit.js"
import { isDayClosed, DAY_CLOSED_ERROR } from "../services/dayClose.js"

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

// Deduct recipe inventory for a bill once it's actually paid (fetches the order's
// active items). Kept off the bill-creation path so abandoned/unpaid bills don't
// wrongly consume stock.
async function deductInventoryForPaidBill(outletId: string, billId: string, orderId: string, recordedById: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } })
  if (!order) return
  const activeItems = order.items.filter((i) => !i.isVoided).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }))
  await deductInventoryForBill(outletId, billId, activeItems, recordedById)
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
      const [kotAgg] = await db.select({ maxNum: max(kots.kotNumber) }).from(kots).where(eq(kots.outletId, outletId))
      const kotNumber = (kotAgg?.maxNum ?? 0) + 1
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

  const [billAgg] = await db.select({ maxNum: max(bills.billNumber) }).from(bills).where(eq(bills.outletId, outletId))
  const billNumber = (billAgg?.maxNum ?? 0) + 1

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

  // Inventory is deducted when the bill is paid (see the payment handlers), not
  // here — so an abandoned/unpaid bill never consumes stock.

  return c.json(bill, 201)
})

// ── Bill history ─────────────────────────────────────────────────────────────

const listBillsQuerySchema = dateRangeSchema.extend({
  q: z.string().optional(),
  status: z.enum(["all", "paid", "unpaid"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
})

const BILLS_PAGE_SIZE = 50

billingRouter.get("/", requireRole("owner", "manager", "cashier"), zValidator("query", listBillsQuerySchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to, q, status, page } = c.req.valid("query")

  const conditions = [
    eq(bills.outletId, outletId),
    gte(bills.createdAt, dayStart(from)),
    lte(bills.createdAt, dayEnd(to)),
  ]
  if (status === "paid") conditions.push(eq(bills.isPaid, true))
  if (status === "unpaid") conditions.push(eq(bills.isPaid, false))
  if (q?.trim()) {
    const num = Number(q.trim().replace(/^#/, ""))
    if (!Number.isInteger(num) || num < 0) return c.json({ bills: [], total: 0, page: 1, pageSize: BILLS_PAGE_SIZE })
    conditions.push(eq(bills.billNumber, num))
  }
  const where = and(...conditions)

  const [rows, countRows] = await Promise.all([
    db.query.bills.findMany({
      where,
      with: {
        payments: { columns: { mode: true, amount: true } },
        createdBy: { columns: { name: true } },
        order: {
          columns: { type: true, source: true },
          with: {
            table: { columns: { name: true } },
            customer: { columns: { name: true, phone: true } },
            items: { columns: { quantity: true, isVoided: true } },
          },
        },
      },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
      limit: BILLS_PAGE_SIZE,
      offset: (page - 1) * BILLS_PAGE_SIZE,
    }),
    db.select({ value: count() }).from(bills).where(where),
  ])

  return c.json({
    bills: rows.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      createdAt: b.createdAt,
      subtotal: b.subtotal,
      taxTotal: b.taxTotal,
      discountAmount: b.discountAmount,
      total: b.total,
      isPaid: b.isPaid,
      isVoided: b.isVoided,
      paymentModes: [...new Set(b.payments.map((p) => p.mode))],
      orderType: b.order?.type ?? null,
      source: b.order?.source ?? null,
      tableName: b.order?.table?.name ?? null,
      customerName: b.order?.customer?.name ?? b.order?.customer?.phone ?? null,
      createdByName: b.createdBy?.name ?? null,
      itemCount: (b.order?.items ?? []).filter((i) => !i.isVoided).reduce((s, i) => s + i.quantity, 0),
    })),
    total: Number(countRows[0]?.value ?? 0),
    page,
    pageSize: BILLS_PAGE_SIZE,
  })
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
  const { outletId, userId } = c.get("user")
  const billId = c.req.param("id")
  const { discountId, code, label, amount } = c.req.valid("json")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true, discountLines: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Cannot modify a paid bill" }, 400)
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)
  if (bill.payments.length > 0) return c.json({ error: "Cannot add discount after payment has started" }, 400)
  if (await isDayClosed(outletId, bill.createdAt)) return c.json({ error: DAY_CLOSED_ERROR }, 400)

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

  logAudit({
    outletId, userId, action: "discount.apply", entity: "bill", entityId: billId,
    details: { billNumber: bill.billNumber, label, amount, code: code ?? null },
  })

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
  const { outletId, userId } = c.get("user")
  const billId = c.req.param("id")
  const lineId = c.req.param("lineId")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true, discountLines: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Cannot modify a paid bill" }, 400)
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)
  if (bill.payments.length > 0) return c.json({ error: "Cannot remove discount after payment has started" }, 400)
  if (await isDayClosed(outletId, bill.createdAt)) return c.json({ error: DAY_CLOSED_ERROR }, 400)

  const line = bill.discountLines.find((l) => l.id === lineId)
  if (!line) return c.json({ error: "Discount line not found" }, 404)

  await db.delete(billDiscounts).where(eq(billDiscounts.id, lineId))

  logAudit({
    outletId, userId, action: "discount.remove", entity: "bill", entityId: billId,
    details: { billNumber: bill.billNumber, label: line.label, amount: Number(line.amount) },
  })

  const remaining = bill.discountLines.filter((l) => l.id !== lineId)
  const totalDiscount = remaining.reduce((s, l) => s + Number(l.amount), 0)
  const newTotal = Number(bill.subtotal) + Number(bill.taxTotal) - totalDiscount

  await db.update(bills).set({
    discountAmount: String(totalDiscount.toFixed(2)),
    total: String(Math.max(0, newTotal).toFixed(2)),
  }).where(eq(bills.id, billId))

  return c.json({ ok: true })
})

// ── Void / refund ─────────────────────────────────────────────────────────────

const voidBillSchema = z.object({ reason: z.string().max(200).optional() })

// Return loyalty points that were redeemed against this bill
async function reverseRedemptionsForBill(outletId: string, billId: string) {
  const redemptions = await db.query.pointTransactions.findMany({
    where: and(eq(pointTransactions.outletId, outletId), eq(pointTransactions.billId, billId), eq(pointTransactions.type, "redeem")),
  })
  for (const txn of redemptions) {
    const points = Math.abs(txn.delta)
    if (points === 0) continue
    const cp = await db.query.customerPoints.findFirst({
      where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, txn.customerId)),
    })
    if (!cp) continue
    const newTotal = cp.totalPoints + points
    await db.update(customerPoints).set({ totalPoints: newTotal, updatedAt: new Date() }).where(eq(customerPoints.id, cp.id))
    await db.update(customers).set({ loyaltyPoints: newTotal }).where(eq(customers.id, txn.customerId))
    await db.insert(pointTransactions).values({
      outletId, customerId: txn.customerId, delta: points, type: "adjust", billId,
      note: `Returned ${points} pts (bill voided)`,
    })
  }
}

// Void an UNPAID bill (wrong bill raised, discount forgotten, …). Reopens the
// order so it can be edited and re-billed, frees nothing that wasn't taken:
// no money moved, no inventory deducted (that happens at payment), and any
// redeemed points are returned.
billingRouter.post("/:id/void", requireRole("owner", "manager"), zValidator("json", voidBillSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const billId = c.req.param("id")
  const { reason } = c.req.valid("json")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
    with: { payments: true },
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isVoided) return c.json({ error: "Bill is already voided" }, 400)
  if (bill.isPaid) return c.json({ error: "Paid bills must be refunded instead" }, 400)
  if (await isDayClosed(outletId, bill.createdAt)) return c.json({ error: DAY_CLOSED_ERROR }, 400)

  const settled = bill.payments.filter((p) => p.gatewayStatus !== "pending")
  if (settled.length > 0) return c.json({ error: "Bill has recorded payments — refund it instead" }, 400)

  // Drop any abandoned pending-UPI rows so nothing dangles on the voided bill
  await db.delete(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.gatewayStatus, "pending")))

  await reverseRedemptionsForBill(outletId, billId)

  await db.update(bills)
    .set({ isVoided: true, voidReason: reason ?? null, voidedById: userId, voidedAt: new Date() })
    .where(eq(bills.id, billId))

  // Reopen the order for editing / re-billing
  const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) })
  if (order && order.status === "billed") {
    const reopenedStatus = order.type === "dine_in" ? "served" : "open"
    await db.update(orders).set({ status: reopenedStatus, updatedAt: new Date() }).where(eq(orders.id, order.id))
    if (order.tableId) {
      await db.update(tables).set({ status: "occupied", currentOrderId: order.id }).where(eq(tables.id, order.tableId))
      broadcastOutlet(outletId, { type: "table.status", payload: { id: order.tableId, status: "occupied", currentOrderId: order.id } })
    }
  }

  logAudit({
    outletId, userId, action: "bill.void", entity: "bill", entityId: billId,
    details: { billNumber: bill.billNumber, total: Number(bill.total), reason: reason ?? null },
  })

  return c.json({ ok: true })
})

// Refund a PAID bill (owner only). Reverses what payment triggered: earned
// loyalty points are clawed back, redeemed points returned, and recipe
// inventory restored. The bill is excluded from all reports thereafter.
billingRouter.post("/:id/refund", requireRole("owner"), zValidator("json", voidBillSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const billId = c.req.param("id")
  const { reason } = c.req.valid("json")

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.id, billId), eq(bills.outletId, outletId)),
  })
  if (!bill) return c.json({ error: "Not found" }, 404)
  if (bill.isVoided) return c.json({ error: "Bill is already voided" }, 400)
  if (!bill.isPaid) return c.json({ error: "Bill is not paid — void it instead" }, 400)
  if (await isDayClosed(outletId, bill.createdAt)) return c.json({ error: DAY_CLOSED_ERROR }, 400)

  // 1. Claw back points earned on this bill (also undo their lifetime/tier effect)
  const earns = await db.query.pointTransactions.findMany({
    where: and(eq(pointTransactions.outletId, outletId), eq(pointTransactions.billId, billId), eq(pointTransactions.type, "earn")),
  })
  for (const txn of earns) {
    const points = txn.delta
    if (points <= 0) continue
    const cp = await db.query.customerPoints.findFirst({
      where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, txn.customerId)),
    })
    if (!cp) continue
    const newTotal    = Math.max(0, cp.totalPoints - points)
    const newLifetime = Math.max(0, cp.lifetimePoints - points)
    const tier = newLifetime >= 10000 ? "gold" : newLifetime >= 3000 ? "silver" : "bronze"
    await db.update(customerPoints)
      .set({ totalPoints: newTotal, lifetimePoints: newLifetime, tier, updatedAt: new Date() })
      .where(eq(customerPoints.id, cp.id))
    await db.update(customers).set({ loyaltyPoints: newTotal }).where(eq(customers.id, txn.customerId))
    await db.insert(pointTransactions).values({
      outletId, customerId: txn.customerId, delta: -points, type: "adjust", billId,
      note: `Reversed ${points} pts (bill refunded)`,
    })
  }

  // 2. Return points that were redeemed as a discount on this bill
  await reverseRedemptionsForBill(outletId, billId)

  // 3. Restore recipe inventory deducted when the bill was paid
  const saleMovements = await db.query.stockMovements.findMany({
    where: and(eq(stockMovements.outletId, outletId), eq(stockMovements.referenceId, billId), eq(stockMovements.type, "sale")),
  })
  const restoreByIngredient = new Map<string, number>()
  for (const m of saleMovements) {
    const qty = Math.abs(Number(m.delta))
    restoreByIngredient.set(m.ingredientId, (restoreByIngredient.get(m.ingredientId) ?? 0) + qty)
  }
  for (const [ingredientId, qty] of restoreByIngredient) {
    const ingredient = await db.query.ingredients.findFirst({ where: eq(ingredients.id, ingredientId) })
    if (!ingredient) continue
    const newStock = Number(ingredient.currentStock) + qty
    await db.update(ingredients).set({ currentStock: String(newStock.toFixed(4)) }).where(eq(ingredients.id, ingredientId))
    await db.insert(stockMovements).values({
      outletId, ingredientId, type: "adjustment",
      delta: String(qty.toFixed(4)),
      referenceId: billId, referenceType: "refund",
      note: "Stock restored — bill refunded",
      recordedById: userId,
    })
  }

  // 4. Mark voided (excluded from reports; money return is handled physically)
  await db.update(bills)
    .set({ isVoided: true, voidReason: reason ?? null, voidedById: userId, voidedAt: new Date() })
    .where(eq(bills.id, billId))

  logAudit({
    outletId, userId, action: "bill.refund", entity: "bill", entityId: billId,
    details: { billNumber: bill.billNumber, total: Number(bill.total), reason: reason ?? null },
  })

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
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)
  if (await isDayClosed(outletId, bill.createdAt)) return c.json({ error: DAY_CLOSED_ERROR }, 400)

  // Pending UPI payments are not yet settled — don't count them toward the paid balance
  const paidSoFar = bill.payments.reduce((s, p) => s + (p.gatewayStatus === "pending" ? 0 : Number(p.amount)), 0)
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
    deductInventoryForPaidBill(outletId, billId, bill.orderId, c.get("user").userId).catch((err) =>
      console.error("[inventory] auto-deduct failed for bill", billId, err),
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
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)

  const paidSoFar = bill.payments.reduce((s, p) => s + (p.gatewayStatus === "pending" ? 0 : Number(p.amount)), 0)
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
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)

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
  if (bill.isVoided) return c.json({ error: "Bill has been voided" }, 400)

  const payment = await db.query.billPayments.findFirst({ where: and(eq(billPayments.id, paymentId), eq(billPayments.billId, billId)) })
  if (!payment) return c.json({ error: "Payment not found" }, 404)
  if (payment.gatewayStatus === "success") return c.json({ error: "Already confirmed" }, 400)

  await db.update(billPayments).set({ gatewayStatus: "success" }).where(eq(billPayments.id, paymentId))

  // Count settled payments plus the one we just marked successful (still "pending" in the pre-update snapshot)
  const paidSoFar = bill.payments.reduce((s, p) => s + (p.gatewayStatus === "pending" && p.id !== paymentId ? 0 : Number(p.amount)), 0)
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
    deductInventoryForPaidBill(outletId, billId, bill.orderId, c.get("user").userId).catch((err) =>
      console.error("[inventory] auto-deduct failed for bill", billId, err),
    )
  }

  return c.json({ ok: true, isPaid: paidSoFar >= Number(bill.total) })
})

