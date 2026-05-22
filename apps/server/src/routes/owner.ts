import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { createOutletSchema, updateOutletSchema, ownerRegisterSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { owners, outlets, users } from "../db/schema/index.js"
import { bills } from "../db/schema/billing.js"
import { orders } from "../db/schema/orders.js"
import { tables } from "../db/schema/tables.js"
import { menuItems } from "../db/schema/menu.js"
import { requireAuth, requireRole, signToken } from "../middleware/auth.js"

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
  return c.json({ id: owner.id, name: owner.name, email: owner.email, phone: owner.phone })
})

ownerRouter.get("/outlets", async (c) => {
  const { ownerId } = c.get("user")
  const fromParam = c.req.query("from")
  const toParam = c.req.query("to")

  const rangeStart = fromParam
    ? new Date(fromParam + "T00:00:00")
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()
  const rangeEnd = toParam
    ? new Date(toParam + "T23:59:59")
    : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d })()

  const allOutlets = await db.query.outlets.findMany({
    where: and(eq(outlets.ownerId, ownerId), eq(outlets.isActive, true)),
  })

  const outletStats = await Promise.all(
    allOutlets.map(async (outlet) => {
      const rangeBills = await db.query.bills.findMany({
        where: and(
          eq(bills.outletId, outlet.id),
          eq(bills.isPaid, true),
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
        gstin: outlet.gstin,
        setupCode: outlet.setupCode,
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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const setupCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * 32)]).join("")
  const [outlet] = await db.insert(outlets).values({ ...data, ownerId, setupCode }).returning()
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

  return c.json({ outletId, outletName: outlet.name, billCount: paidBills.length, totalRevenue, totalTax, totalDiscount, byPaymentMode })
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
