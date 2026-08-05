import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import {
  createOutletSchema, updateOutletSchema, ownerRegisterSchema,
  taxConfigSchema, createMenuScheduleSchema, updateMenuScheduleSchema,
} from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { owners, outlets, users } from "../db/schema/index.js"
import { bills } from "../db/schema/billing.js"
import { orders } from "../db/schema/orders.js"
import { tables } from "../db/schema/tables.js"
import { menuItems, taxConfigs, menuSchedules, categories } from "../db/schema/menu.js"
import { requireAuth, requireRole, signToken } from "../middleware/auth.js"
import { dayStart, dayEnd, localDateStr } from "../lib/dateRange.js"
import { resolveFeature } from "../lib/entitlements.js"
import { config } from "../config.js"

export const ownerRouter = new Hono<AppEnv>()

// Owner registration (public — first-time setup)
ownerRouter.post("/register", zValidator("json", ownerRegisterSchema), async (c) => {
  const { name, email, password, phone } = c.req.valid("json")

  const existing = await db.query.owners.findFirst({ where: eq(owners.email, email) })
  if (existing) return c.json({ error: "Email already registered" }, 409)

  const passwordHash = await Bun.password.hash(password)
  const rows = await db.insert(owners).values({ name, email, passwordHash, phone }).returning()
  const owner = rows[0]
  if (!owner) return c.json({ error: "Failed to create account" }, 500)

  const token = await signToken({ userId: owner.id, outletId: "", ownerId: owner.id, role: "owner" })
  return c.json({ token, owner: { id: owner.id, name: owner.name, email: owner.email } }, 201)
})

// All routes below require owner auth
ownerRouter.use("*", requireAuth, requireRole("owner"))

ownerRouter.get("/me", async (c) => {
  const { ownerId } = c.get("user")
  const owner = await db.query.owners.findFirst({ where: eq(owners.id, ownerId) })
  if (!owner) return c.json({ error: "Owner not found" }, 404)
  // Any feature key works here — decide() always stamps the caller's current
  // effective plan onto the decision, regardless of which feature was asked about.
  const { plan } = await resolveFeature(ownerId, "multi_outlet")
  return c.json({ id: owner.id, name: owner.name, email: owner.email, phone: owner.phone, isCloud: config.isCloud, plan })
})

ownerRouter.get("/outlets", async (c) => {
  const { ownerId } = c.get("user")
  const fromParam = c.req.query("from")
  const toParam = c.req.query("to")

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date())
  const rangeStart = dayStart(fromParam ?? todayStr)
  const rangeEnd = dayEnd(toParam ?? todayStr)

  const allOutlets = await db.query.outlets.findMany({
    where: and(eq(outlets.ownerId, ownerId), eq(outlets.isActive, true)),
  })

  const outletStats = await Promise.all(
    allOutlets.map(async (outlet) => {
      const rangeBills = await db.query.bills.findMany({
        where: and(
          eq(bills.outletId, outlet.id),
          eq(bills.isPaid, true),
          eq(bills.isVoided, false),
          gte(bills.createdAt, rangeStart),
          lte(bills.createdAt, rangeEnd),
        ),
        with: { payments: true },
      })

      const [openOrderCount, tableCount, menuItemCount, staffCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(orders)
          .where(and(eq(orders.outletId, outlet.id), eq(orders.status, "open")))
          .then((r) => Number(r[0]?.count ?? 0)),
        db.select({ count: sql<number>`count(*)` }).from(tables)
          .where(eq(tables.outletId, outlet.id))
          .then((r) => Number(r[0]?.count ?? 0)),
        db.select({ count: sql<number>`count(*)` }).from(menuItems)
          .where(eq(menuItems.outletId, outlet.id))
          .then((r) => Number(r[0]?.count ?? 0)),
        db.select({ count: sql<number>`count(*)` }).from(users)
          .where(and(eq(users.outletId, outlet.id), eq(users.isActive, true)))
          .then((r) => Number(r[0]?.count ?? 0)),
      ])

      const byPaymentMode = rangeBills
        .flatMap((b) => b.payments)
        .reduce<Record<string, number>>((acc, p) => {
          acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount)
          return acc
        }, {})

      return {
        id: outlet.id,
        name: outlet.name,
        address: outlet.address,
        phone: outlet.phone,
        gstin: outlet.gstin,
        setupCode: outlet.setupCode,
        settings: outlet.settings,
        upiVpa: outlet.upiVpa,
        razorpayConfigured: !!(outlet.razorpayKeyId && outlet.razorpayKeySecret),
        revenue: rangeBills.reduce((s, b) => s + Number(b.total), 0),
        billCount: rangeBills.length,
        byPaymentMode,
        openOrderCount,
        tableCount,
        menuItemCount,
        staffCount,
      }
    }),
  )

  return c.json(outletStats)
})

ownerRouter.post("/outlets", zValidator("json", createOutletSchema), async (c) => {
  const { ownerId } = c.get("user")
  const data = c.req.valid("json")

  // First outlet is always free (new owners start on "free" and must be able to
  // onboard). Only a 2nd+ outlet requires the multi_outlet plan gate.
  const existingCount = await db.select({ count: sql<number>`count(*)` }).from(outlets)
    .where(and(eq(outlets.ownerId, ownerId), eq(outlets.isActive, true)))
    .then((r) => Number(r[0]?.count ?? 0))
  if (existingCount >= 1) {
    const decision = await resolveFeature(ownerId, "multi_outlet")
    if (decision.state !== "allowed") {
      return c.json({
        error: "Your plan includes a single outlet — upgrade for unlimited outlets",
        gate: { feature: "multi_outlet", reason: decision.reason ?? "plan_required", requiredPlan: decision.requiredPlan },
      }, 402)
    }
  }

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const setupCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * 32)]).join("")
  const [outlet] = await db.insert(outlets).values({ ...data, gstin: data.gstin || null, ownerId, setupCode, settings: data.settings ?? {} }).returning()
  return c.json(outlet, 201)
})

ownerRouter.patch("/outlets/:id", zValidator("json", updateOutletSchema), async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const data = c.req.valid("json")

  const outlet = await db.query.outlets.findFirst({
    where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)),
  })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const [updated] = await db.update(outlets).set(data).where(eq(outlets.id, outletId)).returning()
  return c.json(updated)
})

ownerRouter.get("/outlets/:id/summary", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const from = c.req.query("from") ?? new Date().toISOString().slice(0, 10)
  const to = c.req.query("to") ?? from

  const outlet = await db.query.outlets.findFirst({
    where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)),
  })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

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

  return c.json({ outletId, outletName: outlet.name, billCount: paidBills.length, totalRevenue, totalTax, totalDiscount, byPaymentMode })
})

// Daily revenue series for the trend chart — same bill predicate as /summary,
// bucketed per business-local day instead of summed into one total.
ownerRouter.get("/outlets/:id/trend", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const from = c.req.query("from") ?? new Date().toISOString().slice(0, 10)
  const to = c.req.query("to") ?? from

  const outlet = await db.query.outlets.findFirst({
    where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)),
  })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const paidBills = await db.query.bills.findMany({
    where: and(
      eq(bills.outletId, outletId),
      eq(bills.isPaid, true),
      eq(bills.isVoided, false),
      gte(bills.createdAt, dayStart(from)),
      lte(bills.createdAt, dayEnd(to)),
    ),
  })

  const byDay = new Map<string, { revenue: number; billCount: number }>()
  for (const bill of paidBills) {
    const day = localDateStr(new Date(bill.createdAt))
    const slot = byDay.get(day) ?? { revenue: 0, billCount: 0 }
    slot.revenue += Number(bill.total)
    slot.billCount += 1
    byDay.set(day, slot)
  }
  const points = Array.from(byDay.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, billCount: v.billCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return c.json({ points })
})

// Outlet-scoped tax config — owner-authenticated equivalent of GET/PUT /menu/tax,
// for outlets the owner isn't currently signed into via a POS session.
ownerRouter.get("/outlets/:id/tax", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)
  const taxConfig = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })
  return c.json(taxConfig ?? null)
})

ownerRouter.put("/outlets/:id/tax", zValidator("json", taxConfigSchema), async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const data = c.req.valid("json")
  const existing = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })
  const values = { name: data.name, cgstRate: String(data.cgstRate), sgstRate: String(data.sgstRate), igstRate: String(data.igstRate) }

  if (existing) {
    const [updated] = await db.update(taxConfigs).set(values).where(eq(taxConfigs.id, existing.id)).returning()
    return c.json(updated)
  }
  const [created] = await db.insert(taxConfigs).values({ ...values, outletId }).returning()
  return c.json(created, 201)
})

// Outlet-scoped schedules — owner-authenticated equivalent of the /menu/schedules
// routes, scoped by an explicit :id + ownership check instead of a session outletId.
ownerRouter.get("/outlets/:id/schedules", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)
  const scheduleList = await db.query.menuSchedules.findMany({ where: eq(menuSchedules.outletId, outletId) })
  return c.json(scheduleList)
})

ownerRouter.post("/outlets/:id/schedules", zValidator("json", createMenuScheduleSchema), async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const data = c.req.valid("json")
  const [schedule] = await db.insert(menuSchedules).values({ ...data, percentOff: String(data.percentOff), outletId }).returning()
  return c.json(schedule, 201)
})

ownerRouter.patch("/outlets/:id/schedules/:scheduleId", zValidator("json", updateMenuScheduleSchema), async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const scheduleId = c.req.param("scheduleId")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.percentOff !== undefined) updates.percentOff = String(data.percentOff)
  const [schedule] = await db.update(menuSchedules).set(updates)
    .where(and(eq(menuSchedules.id, scheduleId), eq(menuSchedules.outletId, outletId)))
    .returning()
  if (!schedule) return c.json({ error: "Not found" }, 404)
  return c.json(schedule)
})

ownerRouter.delete("/outlets/:id/schedules/:scheduleId", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")
  const scheduleId = c.req.param("scheduleId")
  const outlet = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const schedule = await db.query.menuSchedules.findFirst({ where: and(eq(menuSchedules.id, scheduleId), eq(menuSchedules.outletId, outletId)) })
  if (!schedule) return c.json({ error: "Not found" }, 404)
  // Detach items/categories first so the FK doesn't block deletion (mirrors menu.ts).
  await db.update(menuItems).set({ scheduleId: null }).where(and(eq(menuItems.scheduleId, scheduleId), eq(menuItems.outletId, outletId)))
  await db.update(categories).set({ scheduleId: null }).where(and(eq(categories.scheduleId, scheduleId), eq(categories.outletId, outletId)))
  await db.delete(menuSchedules).where(eq(menuSchedules.id, scheduleId))
  return c.body(null, 204)
})

// Generate an outlet-switch token for the owner to act in the POS at a specific outlet.
// Upserts a proxy row in `users` so the owner has a real users.id that satisfies all FK constraints
// (stock_movements.recorded_by_id, purchase_orders.created_by_id, etc.).
ownerRouter.post("/outlets/:id/switch", async (c) => {
  const { ownerId } = c.get("user")
  const outletId = c.req.param("id")

  const [outlet, owner] = await Promise.all([
    db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, ownerId)) }),
    db.query.owners.findFirst({ where: eq(owners.id, ownerId), columns: { id: true, name: true } }),
  ])
  if (!outlet || !owner) return c.json({ error: "Outlet not found" }, 404)

  // Find or create the owner's proxy user row for this outlet (role="owner", pin=null).
  let ownerUser = await db.query.users.findFirst({
    where: and(eq(users.outletId, outletId), eq(users.role, "owner")),
  })
  if (!ownerUser) {
    const [inserted] = await db
      .insert(users)
      .values({ outletId, name: owner.name, role: "owner", pin: null, isActive: true })
      .returning()
    if (!inserted) return c.json({ error: "Failed to create owner user" }, 500)
    ownerUser = inserted
  }

  const token = await signToken({ userId: ownerUser.id, outletId, ownerId, role: "owner" })
  return c.json({
    token,
    user: { id: ownerUser.id, name: owner.name, role: "owner" },
    outlet: { id: outlet.id, name: outlet.name },
  })
})
