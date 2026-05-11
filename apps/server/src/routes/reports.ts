import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte } from "drizzle-orm"
import { dateRangeSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, menuItems, categories } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

type TaxLine = { name: string; rate: number; amount: number }

export const reportsRouter = new Hono<AppEnv>()

reportsRouter.use("*", requireAuth, requireRole("manager", "owner", "cashier"))

reportsRouter.get("/summary", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      gte(bills.createdAt, new Date(from)),
      lte(bills.createdAt, new Date(to + "T23:59:59Z")),
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

  return c.json({
    billCount: paidBills.length,
    totalRevenue,
    totalTax,
    totalDiscount,
    byPaymentMode,
  })
})

reportsRouter.get("/items", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      gte(bills.createdAt, new Date(from)),
      lte(bills.createdAt, new Date(to + "T23:59:59Z")),
    ),
    with: { order: { with: { items: true } } },
  })

  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>()
  for (const bill of paidBills) {
    for (const item of bill.order.items.filter((i) => !i.isVoided)) {
      const prev = itemMap.get(item.menuItemId) ?? { name: item.name, quantity: 0, revenue: 0 }
      itemMap.set(item.menuItemId, {
        name: item.name,
        quantity: prev.quantity + item.quantity,
        revenue: prev.revenue + Number(item.unitPrice) * item.quantity,
      })
    }
  }

  return c.json(
    Array.from(itemMap.entries())
      .map(([menuItemId, d]) => ({ menuItemId, ...d }))
      .sort((a, b) => b.revenue - a.revenue),
  )
})

reportsRouter.get("/categories", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const [paidBills, allItems, allCategories] = await Promise.all([
    db.query.bills.findMany({
      where: and(
        eq(bills.outletId, outletId),
        eq(bills.isPaid, true),
        gte(bills.createdAt, new Date(from)),
        lte(bills.createdAt, new Date(to + "T23:59:59Z")),
      ),
      with: { order: { with: { items: true } } },
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
        revenue: prev.revenue + Number(item.unitPrice) * item.quantity,
      })
    }
  }

  return c.json(
    Array.from(catMap.entries())
      .map(([categoryId, d]) => ({ categoryId, ...d }))
      .sort((a, b) => b.revenue - a.revenue),
  )
})

reportsRouter.get("/gstr1", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      gte(bills.createdAt, new Date(from)),
      lte(bills.createdAt, new Date(to + "T23:59:59Z")),
    ),
  })

  // Group CGST+SGST pairs by their combined rate
  const buckets = new Map<string, { cgstRate: number; sgstRate: number; taxableValue: number; cgst: number; sgst: number; invoiceCount: number }>()

  for (const bill of paidBills) {
    const lines = (bill.taxLines as TaxLine[]) ?? []
    const cgstLines = lines.filter((l) => l.name === "CGST")
    const sgstLines = lines.filter((l) => l.name === "SGST")

    // Match CGST and SGST pairs by rate (CGST 2.5% pairs with SGST 2.5%)
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

    // Handle bills with no CGST (zero-rated)
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

  return c.json({ from, to, summary, totalBills: paidBills.length })
})

reportsRouter.get("/bills/export", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      gte(bills.createdAt, new Date(from)),
      lte(bills.createdAt, new Date(to + "T23:59:59Z")),
    ),
    with: { order: { with: { items: true } }, payments: true },
    orderBy: (b, { asc }) => [asc(b.createdAt)],
  })

  // Fetch HSN codes for all menu items referenced
  const menuItemIds = [...new Set(paidBills.flatMap((b) => b.order.items.map((i) => i.menuItemId)).filter(Boolean) as string[])]
  const hsnMap = new Map<string, string>()
  if (menuItemIds.length > 0) {
    const items = await db.query.menuItems.findMany({ where: (m, { inArray }) => inArray(m.id, menuItemIds) })
    for (const item of items) if (item.hsnCode) hsnMap.set(item.id, item.hsnCode)
  }

  const rows: string[] = ["Bill No,Date,Item,HSN,Qty,Rate,Taxable Value,CGST %,CGST Amt,SGST %,SGST Amt,Total,Payment Mode"]

  for (const bill of paidBills) {
    const date = new Date(bill.createdAt).toLocaleDateString("en-IN")
    const taxLines = (bill.taxLines as TaxLine[]) ?? []
    const cgstRate = taxLines.find((l) => l.name === "CGST")?.rate ?? 0
    const sgstRate = taxLines.find((l) => l.name === "SGST")?.rate ?? 0
    const paymentModes = bill.payments.map((p) => p.mode).join("+")

    for (const item of bill.order.items.filter((i) => !i.isVoided)) {
      const taxable = Number(item.unitPrice) * item.quantity
      const cgstAmt = parseFloat(((taxable * cgstRate) / 100).toFixed(2))
      const sgstAmt = parseFloat(((taxable * sgstRate) / 100).toFixed(2))
      const hsn = (item.menuItemId ? hsnMap.get(item.menuItemId) : "") ?? ""
      const line = [
        bill.billNumber,
        date,
        `"${item.name.replace(/"/g, '""')}"`,
        hsn,
        item.quantity,
        item.unitPrice,
        taxable.toFixed(2),
        cgstRate,
        cgstAmt,
        sgstRate,
        sgstAmt,
        (taxable + cgstAmt + sgstAmt).toFixed(2),
        paymentModes,
      ].join(",")
      rows.push(line)
    }
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bills-${from}-to-${to}.csv"`,
    },
  })
})

reportsRouter.get("/hourly", async (c) => {
  const { outletId } = c.get("user")
  const date = c.req.query("date") // YYYY-MM-DD

  if (!date) return c.json({ error: "date query param required" }, 400)

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      gte(bills.createdAt, new Date(date + "T00:00:00Z")),
      lte(bills.createdAt, new Date(date + "T23:59:59Z")),
    ),
  })

  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }))
  for (const bill of paidBills) {
    const h = new Date(bill.createdAt).getUTCHours()
    const slot = hourly[h]!
    slot.revenue += Number(bill.total)
    slot.count++
  }
  return c.json(hourly.filter((h) => h.count > 0))
})
