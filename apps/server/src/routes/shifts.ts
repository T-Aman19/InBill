import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, isNull, inArray, gte, lte, sql, count } from "drizzle-orm"
import { z } from "zod"
import { openShiftSchema, closeShiftSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { shifts, shiftCashEntries, bills, billPayments, dayCloses, orders } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { dayStart, dayEnd, localDateStr } from "../lib/dateRange.js"
import { logAudit } from "../services/audit.js"

export const shiftsRouter = new Hono<AppEnv>()

shiftsRouter.use("*", requireAuth)

const cashEntrySchema = z.object({
  type: z.enum(["in", "out"]),
  amount: z.number().positive().max(1_000_000),
  note: z.string().max(200).optional(),
})

shiftsRouter.get("/active", async (c) => {
  const { outletId } = c.get("user")
  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  return c.json(shift ?? null)
})

// Live reconciliation for the open shift: expected drawer cash = opening float
// + cash payments taken during the shift + cash-in entries − cash-out entries.
// Closes the shift journey's loop — staff see expected vs counted at close time.
shiftsRouter.get("/summary", async (c) => {
  const { outletId } = c.get("user")
  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  if (!shift) return c.json(null)

  // Payments taken since the shift opened (settled only — pending UPI excluded)
  const [paymentAgg] = await db
    .select({
      cash: sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'cash'), 0)`,
      card: sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'card'), 0)`,
      upi:  sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'upi'), 0)`,
    })
    .from(billPayments)
    .innerJoin(bills, eq(billPayments.billId, bills.id))
    .where(and(
      eq(bills.outletId, outletId),
      eq(bills.isVoided, false),
      gte(billPayments.createdAt, shift.openedAt),
      sql`(${billPayments.gatewayStatus} is null or ${billPayments.gatewayStatus} = 'success')`,
    ))

  const entries = await db.query.shiftCashEntries.findMany({ where: eq(shiftCashEntries.shiftId, shift.id) })
  const cashIn  = entries.filter((e) => e.type === "in").reduce((s, e) => s + Number(e.amount), 0)
  const cashOut = entries.filter((e) => e.type === "out").reduce((s, e) => s + Number(e.amount), 0)

  const cashSales = Number(paymentAgg?.cash ?? 0)
  const expectedCash = Number(shift.openingCash) + cashSales + cashIn - cashOut

  return c.json({
    shift,
    cashSales: cashSales.toFixed(2),
    cardSales: Number(paymentAgg?.card ?? 0).toFixed(2),
    upiSales:  Number(paymentAgg?.upi ?? 0).toFixed(2),
    cashIn: cashIn.toFixed(2),
    cashOut: cashOut.toFixed(2),
    expectedCash: expectedCash.toFixed(2),
  })
})

shiftsRouter.post("/open", requireRole("manager", "owner", "cashier"), zValidator("json", openShiftSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const { openingCash } = c.req.valid("json")

  const existing = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  if (existing) return c.json({ error: "A shift is already open" }, 400)

  const [shift] = await db.insert(shifts).values({ outletId, openedById: userId, openingCash: String(openingCash) }).returning()
  logAudit({ outletId, userId, action: "shift.open", entity: "shift", entityId: shift?.id, details: { openingCash } })
  return c.json(shift, 201)
})

shiftsRouter.post("/close", requireRole("manager", "owner", "cashier"), zValidator("json", closeShiftSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const { closingCash } = c.req.valid("json")

  const shift = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  if (!shift) return c.json({ error: "No open shift" }, 400)

  const [closed] = await db
    .update(shifts)
    .set({ closedById: userId, closingCash: String(closingCash), closedAt: new Date() })
    .where(eq(shifts.id, shift.id))
    .returning()

  logAudit({ outletId, userId, action: "shift.close", entity: "shift", entityId: shift.id, details: { openingCash: Number(shift.openingCash), closingCash } })
  return c.json(closed)
})

// Cash entries (used for expenses / petty cash tracking)
shiftsRouter.get("/cash-entries", async (c) => {
  const { outletId } = c.get("user")
  const from = c.req.query("from")
  const to = c.req.query("to")

  const outletShifts = await db.query.shifts.findMany({ where: eq(shifts.outletId, outletId) })
  if (outletShifts.length === 0) return c.json([])

  const shiftIds = outletShifts.map((s) => s.id)
  const entries = await db.query.shiftCashEntries.findMany({
    where: and(
      inArray(shiftCashEntries.shiftId, shiftIds),
      from ? gte(shiftCashEntries.createdAt, dayStart(from)) : undefined,
      to ? lte(shiftCashEntries.createdAt, dayEnd(to)) : undefined,
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
  return c.json(entries)
})

shiftsRouter.post("/cash-entries", requireRole("manager", "owner", "cashier"), zValidator("json", cashEntrySchema), async (c) => {
  const { outletId } = c.get("user")
  const { type, amount, note } = c.req.valid("json")

  const activeShift = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  if (!activeShift) return c.json({ error: "No open shift" }, 400)

  const [entry] = await db.insert(shiftCashEntries)
    .values({ shiftId: activeShift.id, type, amount: String(amount), note })
    .returning()
  logAudit({
    outletId, userId: c.get("user").userId, action: type === "in" ? "cash.in" : "cash.out",
    entity: "cash_entry", entityId: entry?.id, details: { amount, note: note ?? null },
  })
  return c.json(entry, 201)
})

shiftsRouter.delete("/cash-entries/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")

  const outletShifts = await db.query.shifts.findMany({ where: eq(shifts.outletId, outletId) })
  const shiftIds = outletShifts.map((s) => s.id)
  if (shiftIds.length === 0) return c.body(null, 204)

  const entry = await db.query.shiftCashEntries.findFirst({
    where: and(eq(shiftCashEntries.id, c.req.param("id")), inArray(shiftCashEntries.shiftId, shiftIds)),
  })
  if (!entry) return c.json({ error: "Not found" }, 404)

  await db.delete(shiftCashEntries).where(eq(shiftCashEntries.id, entry.id))
  logAudit({
    outletId, userId: c.get("user").userId, action: "cash.entry_delete",
    entity: "cash_entry", entityId: entry.id, details: { type: entry.type, amount: Number(entry.amount), note: entry.note },
  })
  return c.body(null, 204)
})

// ── Day close / Z-report ─────────────────────────────────────────────────────

// Everything the Z-report shows, computed live for a business date. Snapshotted
// into day_closes.summary at close time so the report never drifts afterwards.
async function computeDaySummary(outletId: string, date: string) {
  const start = dayStart(date)
  const end = dayEnd(date)

  const dayBills = await db.query.bills.findMany({
    where: and(eq(bills.outletId, outletId), gte(bills.createdAt, start), lte(bills.createdAt, end)),
    columns: { id: true, isPaid: true, isVoided: true, subtotal: true, taxTotal: true, discountAmount: true, total: true },
  })
  const paid    = dayBills.filter((b) => !b.isVoided && b.isPaid)
  const unpaid  = dayBills.filter((b) => !b.isVoided && !b.isPaid)
  const voided  = dayBills.filter((b) => b.isVoided)

  // Settled payments taken during the day (by payment timestamp — this is what
  // physically landed in the drawer/machine, even for bills raised yesterday)
  const [payAgg] = await db
    .select({
      cash:   sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'cash'), 0)`,
      card:   sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'card'), 0)`,
      upi:    sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'upi'), 0)`,
      credit: sql<string>`coalesce(sum(${billPayments.amount}) filter (where ${billPayments.mode} = 'credit'), 0)`,
    })
    .from(billPayments)
    .innerJoin(bills, eq(billPayments.billId, bills.id))
    .where(and(
      eq(bills.outletId, outletId),
      eq(bills.isVoided, false),
      gte(billPayments.createdAt, start),
      lte(billPayments.createdAt, end),
      sql`(${billPayments.gatewayStatus} is null or ${billPayments.gatewayStatus} = 'success')`,
    ))

  // Drawer movements during the day (scoped to this outlet via its shifts)
  const outletShifts = await db.query.shifts.findMany({ where: eq(shifts.outletId, outletId), columns: { id: true, openingCash: true, openedAt: true } })
  const shiftIds = outletShifts.map((s) => s.id)
  const entries = shiftIds.length
    ? await db.query.shiftCashEntries.findMany({
        where: and(inArray(shiftCashEntries.shiftId, shiftIds), gte(shiftCashEntries.createdAt, start), lte(shiftCashEntries.createdAt, end)),
      })
    : []
  const cashIn  = entries.filter((e) => e.type === "in").reduce((s, e) => s + Number(e.amount), 0)
  const cashOut = entries.filter((e) => e.type === "out").reduce((s, e) => s + Number(e.amount), 0)
  const openingFloat = outletShifts
    .filter((s) => s.openedAt >= start && s.openedAt <= end)
    .reduce((s, sh) => s + Number(sh.openingCash), 0)

  const byMode = {
    cash:   Number(payAgg?.cash ?? 0),
    card:   Number(payAgg?.card ?? 0),
    upi:    Number(payAgg?.upi ?? 0),
    credit: Number(payAgg?.credit ?? 0),
  }
  const expectedCash = openingFloat + byMode.cash + cashIn - cashOut

  // Open orders block a clean close — surfaced as a warning, not an error
  const [openAgg] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.outletId, outletId), inArray(orders.status, ["open", "kot_sent", "served"])))

  const sum = (rows: { total: string }[]) => rows.reduce((s, b) => s + Number(b.total), 0)
  return {
    date,
    billCount: paid.length,
    grossSales: Number(sum(paid).toFixed(2)),
    taxTotal: Number(paid.reduce((s, b) => s + Number(b.taxTotal), 0).toFixed(2)),
    discountTotal: Number(paid.reduce((s, b) => s + Number(b.discountAmount), 0).toFixed(2)),
    unpaidCount: unpaid.length,
    unpaidTotal: Number(sum(unpaid).toFixed(2)),
    voidCount: voided.length,
    voidTotal: Number(sum(voided).toFixed(2)),
    byMode,
    openingFloat: Number(openingFloat.toFixed(2)),
    cashIn: Number(cashIn.toFixed(2)),
    cashOut: Number(cashOut.toFixed(2)),
    expectedCash: Number(expectedCash.toFixed(2)),
    openOrders: Number(openAgg?.value ?? 0),
  }
}

export type DaySummary = Awaited<ReturnType<typeof computeDaySummary>>

shiftsRouter.get("/day-close", requireRole("manager", "owner"), zValidator("query", z.object({ date: z.string().date() })), async (c) => {
  const { outletId } = c.get("user")
  const { date } = c.req.valid("query")

  const closed = await db.query.dayCloses.findFirst({
    where: and(eq(dayCloses.outletId, outletId), eq(dayCloses.businessDate, date)),
  })
  if (closed) return c.json({ closed, preview: null })

  const preview = await computeDaySummary(outletId, date)
  return c.json({ closed: null, preview })
})

const dayClosePostSchema = z.object({
  date: z.string().date(),
  countedCash: z.number().min(0).max(10_000_000),
  note: z.string().max(300).optional(),
})

shiftsRouter.post("/day-close", requireRole("manager", "owner"), zValidator("json", dayClosePostSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const { date, countedCash, note } = c.req.valid("json")

  if (date > localDateStr(new Date())) return c.json({ error: "Cannot close a future date" }, 400)

  const existing = await db.query.dayCloses.findFirst({
    where: and(eq(dayCloses.outletId, outletId), eq(dayCloses.businessDate, date)),
  })
  if (existing) return c.json({ error: "This day is already closed" }, 400)

  const summary = await computeDaySummary(outletId, date)

  const [row] = await db.insert(dayCloses).values({
    outletId,
    businessDate: date,
    closedById: userId,
    expectedCash: String(summary.expectedCash.toFixed(2)),
    countedCash: String(countedCash.toFixed(2)),
    summary,
    note,
  }).returning()

  logAudit({
    outletId, userId, action: "day.close", entity: "day_close", entityId: row?.id,
    details: { date, expectedCash: summary.expectedCash, countedCash, variance: Number((countedCash - summary.expectedCash).toFixed(2)) },
  })

  return c.json(row, 201)
})