import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, desc } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { loyaltyPrograms, customerPoints, pointTransactions } from "../db/schema/index.js"
import { customers, bills, orders } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { phoneSchema } from "@inbill/shared"

export const loyaltyRouter = new Hono<AppEnv>()

loyaltyRouter.use("*", requireAuth)

const loyaltyConfigSchema = z.object({
  pointsPerRupee: z.number().min(0.01).max(10).optional(),
  redeemRate: z.number().min(1).max(10_000).optional(),
  minRedeemPoints: z.number().int().min(1).max(100_000).optional(),
  isActive: z.boolean().optional(),
})

const redeemSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number().int().positive().max(1_000_000),
  billId: z.string().uuid(),
})

// GET /api/loyalty/config
loyaltyRouter.get("/config", async (c) => {
  const { outletId } = c.get("user")
  const program = await db.query.loyaltyPrograms.findFirst({ where: eq(loyaltyPrograms.outletId, outletId) })
  return c.json(program ?? null)
})

// POST /api/loyalty/config — upsert loyalty program settings (owner/manager only)
loyaltyRouter.post("/config", requireRole("owner", "manager"), zValidator("json", loyaltyConfigSchema), async (c) => {
  const { outletId } = c.get("user")
  const body = c.req.valid("json")

  const existing = await db.query.loyaltyPrograms.findFirst({ where: eq(loyaltyPrograms.outletId, outletId) })

  if (existing) {
    const [updated] = await db
      .update(loyaltyPrograms)
      .set({
        pointsPerRupee: body.pointsPerRupee !== undefined ? String(body.pointsPerRupee) : existing.pointsPerRupee,
        redeemRate: body.redeemRate !== undefined ? String(body.redeemRate) : existing.redeemRate,
        minRedeemPoints: body.minRedeemPoints ?? existing.minRedeemPoints,
        isActive: body.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(loyaltyPrograms.outletId, outletId))
      .returning()
    return c.json(updated)
  }

  const [created] = await db
    .insert(loyaltyPrograms)
    .values({
      outletId,
      pointsPerRupee: String(body.pointsPerRupee ?? 1),
      redeemRate: String(body.redeemRate ?? 100),
      minRedeemPoints: body.minRedeemPoints ?? 100,
      isActive: body.isActive ?? true,
    })
    .returning()
  return c.json(created, 201)
})

// GET /api/loyalty/customers/:phone — look up customer + points balance
loyaltyRouter.get("/customers/:phone", async (c) => {
  const { outletId } = c.get("user")
  const rawPhone = c.req.param("phone")

  const parsed = phoneSchema.safeParse(rawPhone)
  if (!parsed.success) return c.json({ error: "Invalid phone number format" }, 400)
  const phone = parsed.data

  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.outletId, outletId), eq(customers.phone, phone)),
  })
  if (!customer) return c.json({ error: "Customer not found" }, 404)

  const points = await db.query.customerPoints.findFirst({
    where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, customer.id)),
  })

  const recentTxns = await db.query.pointTransactions.findMany({
    where: and(eq(pointTransactions.outletId, outletId), eq(pointTransactions.customerId, customer.id)),
    orderBy: [desc(pointTransactions.createdAt)],
    limit: 10,
  })

  return c.json({
    customer,
    totalPoints: points?.totalPoints ?? 0,
    lifetimePoints: points?.lifetimePoints ?? 0,
    tier: points?.tier ?? "bronze",
    recentTransactions: recentTxns,
  })
})

// POST /api/loyalty/redeem — deduct points, insert transaction, apply discount line to bill
loyaltyRouter.post("/redeem", requireRole("owner", "manager", "cashier"), zValidator("json", redeemSchema), async (c) => {
  const { outletId } = c.get("user")
  const { customerId, points, billId } = c.req.valid("json")

  const program = await db.query.loyaltyPrograms.findFirst({ where: and(eq(loyaltyPrograms.outletId, outletId), eq(loyaltyPrograms.isActive, true)) })
  if (!program) return c.json({ error: "Loyalty program is not active" }, 400)

  if (points < program.minRedeemPoints) return c.json({ error: `Minimum redemption is ${program.minRedeemPoints} points` }, 400)

  const cpRow = await db.query.customerPoints.findFirst({
    where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, customerId)),
  })
  if (!cpRow || cpRow.totalPoints < points) return c.json({ error: "Insufficient points" }, 400)

  const bill = await db.query.bills.findFirst({ where: and(eq(bills.id, billId), eq(bills.outletId, outletId)) })
  if (!bill) return c.json({ error: "Bill not found" }, 404)
  if (bill.isPaid) return c.json({ error: "Bill is already paid" }, 400)

  // redeemRate = points per rupee of discount (e.g. 100 pts = ₹10 → rate = 100/10 = 10 pts/₹)
  const discountRupees = parseFloat((points / Number(program.redeemRate)).toFixed(2))

  // Deduct points from balance
  const newBalance = cpRow.totalPoints - points
  await db
    .update(customerPoints)
    .set({ totalPoints: newBalance, updatedAt: new Date() })
    .where(eq(customerPoints.id, cpRow.id))

  await db.update(customers).set({ loyaltyPoints: newBalance }).where(eq(customers.id, customerId))

  // Insert point transaction
  await db.insert(pointTransactions).values({
    outletId,
    customerId,
    delta: -points,
    type: "redeem",
    billId,
    note: `Redeemed ${points} pts for ₹${discountRupees} off`,
  })

  // Apply discount line to bill
  const { billDiscounts } = await import("../db/schema/index.js")
  const [line] = await db
    .insert(billDiscounts)
    .values({ billId, label: `Loyalty (${points} pts)`, amount: String(discountRupees) })
    .returning()

  // Recompute bill total
  const allLines = await db.query.billDiscounts.findMany({ where: eq(billDiscounts.billId, billId) })
  const totalDiscount = allLines.reduce((s, l) => s + Number(l.amount), 0)
  const newTotal = Math.max(0, Number(bill.subtotal) + Number(bill.taxTotal) - totalDiscount)
  await db.update(bills).set({ discountAmount: String(totalDiscount.toFixed(2)), total: String(newTotal.toFixed(2)) }).where(eq(bills.id, billId))

  return c.json({ ok: true, pointsDeducted: points, discountApplied: discountRupees, newBalance, discountLineId: line?.id })
})

// GET /api/loyalty/bill/:billId — customer + points for the bill (used by BillingPage)
loyaltyRouter.get("/bill/:billId", async (c) => {
  const { outletId } = c.get("user")
  const billId = c.req.param("billId")

  const program = await db.query.loyaltyPrograms.findFirst({ where: and(eq(loyaltyPrograms.outletId, outletId), eq(loyaltyPrograms.isActive, true)) })
  if (!program) return c.json(null)

  const bill = await db.query.bills.findFirst({ where: and(eq(bills.id, billId), eq(bills.outletId, outletId)), columns: { orderId: true, total: true } })
  if (!bill) return c.json(null)

  const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId), columns: { customerId: true } })
  if (!order?.customerId) return c.json(null)

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, order.customerId) })
  if (!customer) return c.json(null)

  const cp = await db.query.customerPoints.findFirst({ where: and(eq(customerPoints.outletId, outletId), eq(customerPoints.customerId, order.customerId)) })

  const totalPoints    = cp?.totalPoints    ?? 0
  const lifetimePoints = cp?.lifetimePoints ?? 0
  const tier           = cp?.tier ?? "bronze"
  const pointsToEarn   = Math.floor(Number(bill.total) * Number(program.pointsPerRupee))
  const redeemValue    = parseFloat((totalPoints / Number(program.redeemRate)).toFixed(2))

  return c.json({ customer, totalPoints, lifetimePoints, tier, pointsToEarn, redeemValue, program })
})

// GET /api/loyalty/top-customers?limit=20
loyaltyRouter.get("/top-customers", requireRole("owner", "manager"), async (c) => {
  const { outletId } = c.get("user")
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100)

  const rows = await db.query.customerPoints.findMany({
    where: eq(customerPoints.outletId, outletId),
    orderBy: [desc(customerPoints.lifetimePoints)],
    limit,
  })

  if (rows.length === 0) return c.json([])

  const customerIds = rows.map((r) => r.customerId)
  const customerRows = await db.query.customers.findMany({
    where: (cust, { inArray }) => inArray(cust.id, customerIds),
  })
  const custMap = new Map(customerRows.map((c) => [c.id, c]))

  return c.json(rows.map((r) => ({ ...r, customer: custMap.get(r.customerId) ?? null })))
})