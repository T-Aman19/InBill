// Shared report-data queries — used by both routes/reports.ts (REST, staff-facing)
// and lib/mcpTools.ts (MCP, AI-client-facing) so the two surfaces never drift apart.
import { eq, and, gte, lte } from "drizzle-orm"
import { lineTotal } from "@inbill/shared"
import { db } from "../db/index.js"
import { bills, menuItems, categories, stockMovements, voidedItems } from "../db/schema/index.js"
import { dayStart, dayEnd, localHour } from "./dateRange.js"

type TaxLine = { name: string; rate: number; amount: number }

export async function getSalesSummary(outletId: string, from: string, to: string) {
  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
    with: { payments: true },
  })

  const totalRevenue = paidBills.reduce((s, b) => s + Number(b.total), 0)
  const totalTax = paidBills.reduce((s, b) => s + Number(b.taxTotal), 0)
  const totalDiscount = paidBills.reduce((s, b) => s + Number(b.discountAmount), 0)

  const byPaymentMode = paidBills
    .flatMap((b) => b.payments)
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount)
      return acc
    }, {})

  return { billCount: paidBills.length, totalRevenue, totalTax, totalDiscount, byPaymentMode }
}

export async function getTopItems(outletId: string, from: string, to: string) {
  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
    with: { order: { with: { items: { with: { modifiers: true } } } } },
  })

  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>()
  for (const bill of paidBills) {
    for (const item of bill.order.items.filter((i) => !i.isVoided)) {
      const prev = itemMap.get(item.menuItemId) ?? { name: item.name, quantity: 0, revenue: 0 }
      itemMap.set(item.menuItemId, {
        name: item.name,
        quantity: prev.quantity + item.quantity,
        revenue: prev.revenue + lineTotal(item),
      })
    }
  }

  return Array.from(itemMap.entries())
    .map(([menuItemId, d]) => ({ menuItemId, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getTopCategories(outletId: string, from: string, to: string) {
  const [paidBills, allItems, allCategories] = await Promise.all([
    db.query.bills.findMany({
      where: and(
        eq(bills.outletId, outletId),
        eq(bills.isPaid, true),
        eq(bills.isVoided, false),
        gte(bills.createdAt, dayStart(from)),
        lte(bills.createdAt, dayEnd(to)),
      ),
      with: { order: { with: { items: { with: { modifiers: true } } } } },
    }),
    db.query.menuItems.findMany({ where: eq(menuItems.outletId, outletId) }),
    db.query.categories.findMany({ where: eq(categories.outletId, outletId) }),
  ])

  const itemCategoryMap = new Map(allItems.map((i) => [i.id, i.categoryId]))
  const categoryNameMap = new Map(allCategories.map((c) => [c.id, c.name]))

  const catMap = new Map<string, { name: string; quantity: number; revenue: number }>()
  for (const bill of paidBills) {
    for (const item of bill.order.items.filter((i) => !i.isVoided)) {
      const catId = itemCategoryMap.get(item.menuItemId) ?? "uncategorized"
      const catName = catId === "uncategorized" ? "Uncategorized" : (categoryNameMap.get(catId) ?? "Uncategorized")
      const prev = catMap.get(catId) ?? { name: catName, quantity: 0, revenue: 0 }
      catMap.set(catId, {
        name: catName,
        quantity: prev.quantity + item.quantity,
        revenue: prev.revenue + lineTotal(item),
      })
    }
  }

  return Array.from(catMap.entries())
    .map(([categoryId, d]) => ({ categoryId, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getGstSummary(outletId: string, from: string, to: string) {
  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
  })

  // Group CGST+SGST pairs by their combined rate
  const buckets = new Map<string, { cgstRate: number; sgstRate: number; taxableValue: number; cgst: number; sgst: number; invoiceCount: number }>()

  for (const bill of paidBills) {
    const lines = (bill.taxLines as TaxLine[]) ?? []
    const cgstLines = lines.filter((l) => l.name === "CGST")
    const sgstLines = lines.filter((l) => l.name === "SGST")

    for (const cgst of cgstLines) {
      const sgst = sgstLines.find((l) => l.rate === cgst.rate)
      const key = String(cgst.rate)
      const taxableForRate = cgst.amount / (cgst.rate / 100)
      const existing = buckets.get(key) ?? { cgstRate: cgst.rate, sgstRate: cgst.rate, taxableValue: 0, cgst: 0, sgst: 0, invoiceCount: 0 }
      existing.taxableValue += taxableForRate
      existing.cgst += cgst.amount
      existing.sgst += sgst?.amount ?? 0
      existing.invoiceCount++
      buckets.set(key, existing)
    }

    if (cgstLines.length === 0) {
      const key = "0"
      const existing = buckets.get(key) ?? { cgstRate: 0, sgstRate: 0, taxableValue: 0, cgst: 0, sgst: 0, invoiceCount: 0 }
      existing.taxableValue += Number(bill.subtotal) - Number(bill.discountAmount)
      existing.invoiceCount++
      buckets.set(key, existing)
    }
  }

  const summary = Array.from(buckets.values()).map((b) => ({
    cgstRate: b.cgstRate,
    sgstRate: b.sgstRate,
    taxableValue: parseFloat(b.taxableValue.toFixed(2)),
    cgst: parseFloat(b.cgst.toFixed(2)),
    sgst: parseFloat(b.sgst.toFixed(2)),
    totalTax: parseFloat((b.cgst + b.sgst).toFixed(2)),
    invoiceCount: b.invoiceCount,
  }))

  return { from, to, summary, totalBills: paidBills.length }
}

export async function getFoodCost(outletId: string, from: string, to: string) {
  const fromDate = dayStart(from)
  const toDate = dayEnd(to)

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, fromDate),
      lte(bills.createdAt, toDate),
    ),
    columns: { total: true },
  })
  const revenue = paidBills.reduce((s, b) => s + Number(b.total), 0)

  const movements = await db.query.stockMovements.findMany({
    where: and(
      eq(stockMovements.outletId, outletId),
      eq(stockMovements.type, "sale"),
      gte(stockMovements.createdAt, fromDate),
      lte(stockMovements.createdAt, toDate),
    ),
    with: { ingredient: { columns: { id: true, name: true, unit: true, costPerUnit: true } } },
  })

  const byIngredient = new Map<string, { name: string; unit: string; qty: number; cost: number }>()
  let totalCogs = 0

  for (const m of movements) {
    const qty = Math.abs(Number(m.delta))
    const costPerUnit = Number(m.ingredient?.costPerUnit ?? 0)
    const cost = qty * costPerUnit
    totalCogs += cost

    const id = m.ingredientId
    const prev = byIngredient.get(id) ?? { name: m.ingredient?.name ?? "Unknown", unit: m.ingredient?.unit ?? "", qty: 0, cost: 0 }
    byIngredient.set(id, { ...prev, qty: prev.qty + qty, cost: prev.cost + cost })
  }

  const foodCostPct = revenue > 0 ? (totalCogs / revenue) * 100 : 0

  return {
    from, to,
    revenue: parseFloat(revenue.toFixed(2)),
    cogs: parseFloat(totalCogs.toFixed(2)),
    foodCostPct: parseFloat(foodCostPct.toFixed(1)),
    byIngredient: Array.from(byIngredient.entries())
      .map(([ingredientId, d]) => ({ ingredientId, ...d, cost: parseFloat(d.cost.toFixed(2)), qty: parseFloat(d.qty.toFixed(4)) }))
      .sort((a, b) => b.cost - a.cost),
  }
}

export async function getHourlySales(outletId: string, date: string) {
  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(date)),
      lte(bills.createdAt, dayEnd(date)),
    ),
  })

  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }))
  for (const bill of paidBills) {
    const h = localHour(new Date(bill.createdAt))
    const slot = hourly[h]!
    slot.revenue += Number(bill.total)
    slot.count++
  }
  return hourly.filter((h) => h.count > 0)
}

export async function getVoidedItems(outletId: string, from: string, to: string) {
  const rows = await db.query.voidedItems.findMany({
    where: and(
      eq(voidedItems.outletId, outletId),
      gte(voidedItems.createdAt, dayStart(from)),
      lte(voidedItems.createdAt, dayEnd(to)),
    ),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  })

  const staffIds = [...new Set(rows.map((r) => r.voidedById).filter(Boolean) as string[])]
  const staffMap = new Map<string, string>()
  if (staffIds.length > 0) {
    const staffRows = await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, staffIds) })
    for (const s of staffRows) staffMap.set(s.id, s.name)
  }

  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    itemName: r.itemName,
    qty: r.qty,
    unitPrice: r.unitPrice,
    staffName: r.voidedById ? (staffMap.get(r.voidedById) ?? "Unknown") : "Unknown",
    createdAt: r.createdAt,
  }))
}

export async function getStaffPerformance(outletId: string, from: string, to: string) {
  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
    columns: { id: true, total: true, createdById: true },
  })

  const staffIds = [...new Set(paidBills.map((b) => b.createdById).filter(Boolean) as string[])]
  const staffMap = new Map<string, string>()
  if (staffIds.length > 0) {
    const staffRows = await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, staffIds) })
    for (const s of staffRows) staffMap.set(s.id, s.name)
  }

  const byStaff = new Map<string, { name: string; billCount: number; revenue: number }>()
  for (const bill of paidBills) {
    const staffId = bill.createdById ?? "unknown"
    const name = staffId === "unknown" ? "Unknown" : (staffMap.get(staffId) ?? "Unknown")
    const prev = byStaff.get(staffId) ?? { name, billCount: 0, revenue: 0 }
    byStaff.set(staffId, { name, billCount: prev.billCount + 1, revenue: prev.revenue + Number(bill.total) })
  }

  return Array.from(byStaff.entries())
    .map(([staffId, d]) => ({ staffId, ...d, revenue: parseFloat(d.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue)
}
