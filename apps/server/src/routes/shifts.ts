import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, isNull, inArray, gte, lte } from "drizzle-orm"
import { z } from "zod"
import { openShiftSchema, closeShiftSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { shifts, shiftCashEntries } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

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

shiftsRouter.post("/open", requireRole("manager", "owner", "cashier"), zValidator("json", openShiftSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const { openingCash } = c.req.valid("json")

  const existing = await db.query.shifts.findFirst({
    where: and(eq(shifts.outletId, outletId), isNull(shifts.closedAt)),
  })
  if (existing) return c.json({ error: "A shift is already open" }, 400)

  const [shift] = await db.insert(shifts).values({ outletId, openedById: userId, openingCash: String(openingCash) }).returning()
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
      from ? gte(shiftCashEntries.createdAt, new Date(from)) : undefined,
      to ? lte(shiftCashEntries.createdAt, new Date(to + "T23:59:59Z")) : undefined,
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
  return c.body(null, 204)
})