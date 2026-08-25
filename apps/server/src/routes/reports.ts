import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte } from "drizzle-orm"
import { dateRangeSchema, lineTotal } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { dayStart, dayEnd } from "../lib/dateRange.js"
import {
  getSalesSummary,
  getTopItems,
  getTopCategories,
  getGstSummary,
  getFoodCost,
  getHourlySales,
  getVoidedItems,
  getStaffPerformance,
} from "../lib/reportQueries.js"

type TaxLine = { name: string; rate: number; amount: number }

export const reportsRouter = new Hono<AppEnv>()

reportsRouter.use("*", requireAuth, requireRole("manager", "owner", "cashier"))

reportsRouter.get("/summary", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getSalesSummary(outletId, from, to))
})

reportsRouter.get("/items", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getTopItems(outletId, from, to))
})

reportsRouter.get("/categories", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getTopCategories(outletId, from, to))
})

reportsRouter.get("/gstr1", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getGstSummary(outletId, from, to))
})

reportsRouter.get("/bills/export", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
    with: { order: { with: { items: { with: { modifiers: true } } } }, payments: true },
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
      const taxable = lineTotal(item)
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

reportsRouter.get("/food-cost", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getFoodCost(outletId, from, to))
})

reportsRouter.get("/hourly", async (c) => {
  const { outletId } = c.get("user")
  const date = c.req.query("date") // YYYY-MM-DD

  if (!date) return c.json({ error: "date query param required" }, 400)

  return c.json(await getHourlySales(outletId, date))
})

reportsRouter.get("/voids", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getVoidedItems(outletId, from, to))
})

reportsRouter.get("/staff-performance", zValidator("query", dateRangeSchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to } = c.req.valid("query")
  return c.json(await getStaffPerformance(outletId, from, to))
})
