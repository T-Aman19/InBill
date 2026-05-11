import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte } from "drizzle-orm"
import { dateRangeSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, menuItems, categories } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

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
