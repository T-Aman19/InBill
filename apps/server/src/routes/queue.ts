import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gte, lte, count } from "drizzle-orm"
import { z } from "zod"
import {
  createQueueEntrySchema,
  seatQueueEntrySchema,
  cancelQueueEntrySchema,
  createReservationSchema,
  updateReservationSchema,
} from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { queueEntries, reservations, tables, customers } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"

export const queueRouter = new Hono<AppEnv>()

queueRouter.use("*", requireAuth)

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayBounds() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

async function broadcastQueue(outletId: string) {
  const { start, end } = todayBounds()
  const entries = await db.query.queueEntries.findMany({
    where: and(
      eq(queueEntries.outletId, outletId),
      gte(queueEntries.joinedAt, start),
      lte(queueEntries.joinedAt, end),
    ),
    with: { table: true },
  })
  const serialized = entries.map(serializeEntry)
  broadcastOutlet(outletId, { type: "queue.updated", payload: { entries: serialized } })
  return serialized
}

function serializeEntry(e: typeof queueEntries.$inferSelect & { table?: typeof tables.$inferSelect | null }) {
  return {
    ...e,
    joinedAt: e.joinedAt.toISOString(),
    seatedAt: e.seatedAt?.toISOString() ?? null,
    cancelledAt: e.cancelledAt?.toISOString() ?? null,
  }
}

function serializeReservation(r: typeof reservations.$inferSelect & { table?: typeof tables.$inferSelect | null }) {
  return {
    ...r,
    reservedFor: r.reservedFor.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }
}

// ── Queue endpoints ───────────────────────────────────────────────────────────

queueRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const statusFilter = c.req.query("status") ?? "waiting"
  const { start, end } = todayBounds()

  const entries = await db.query.queueEntries.findMany({
    where: and(
      eq(queueEntries.outletId, outletId),
      gte(queueEntries.joinedAt, start),
      lte(queueEntries.joinedAt, end),
      statusFilter !== "all" ? eq(queueEntries.status, statusFilter as "waiting" | "seated" | "cancelled" | "no_show") : undefined,
    ),
    with: { table: true },
  })

  return c.json(entries.map(serializeEntry))
})

queueRouter.post("/", requireRole("manager", "owner", "cashier", "captain"), zValidator("json", createQueueEntrySchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")

  // Generate sequential token for today (A1, A2, …)
  const { start, end } = todayBounds()
  const [{ value: todayCount }] = await db
    .select({ value: count() })
    .from(queueEntries)
    .where(and(eq(queueEntries.outletId, outletId), gte(queueEntries.joinedAt, start), lte(queueEntries.joinedAt, end)))
  const token = `A${Number(todayCount) + 1}`

  const [entry] = await db.insert(queueEntries).values({
    outletId,
    customerName: data.customerName,
    customerPhone: data.customerPhone ?? null,
    partySize: data.partySize,
    token,
  }).returning()

  await broadcastQueue(outletId)
  return c.json(serializeEntry({ ...entry, table: null }), 201)
})

queueRouter.patch("/:id/seat", requireRole("manager", "owner", "cashier", "captain"), zValidator("json", seatQueueEntrySchema), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const { tableId } = c.req.valid("json")

  const entry = await db.query.queueEntries.findFirst({
    where: and(eq(queueEntries.id, id), eq(queueEntries.outletId, outletId)),
  })
  if (!entry) return c.json({ error: "Not found" }, 404)
  if (entry.status !== "waiting") return c.json({ error: "Entry is no longer waiting" }, 400)

  const table = await db.query.tables.findFirst({
    where: and(eq(tables.id, tableId), eq(tables.outletId, outletId)),
  })
  if (!table) return c.json({ error: "Table not found" }, 404)
  if (table.status !== "available") return c.json({ error: "Table is not available" }, 400)

  const [updated] = await db.update(queueEntries)
    .set({ status: "seated", tableId, seatedAt: new Date() })
    .where(and(eq(queueEntries.id, id), eq(queueEntries.outletId, outletId)))
    .returning()

  // Upsert customer record if phone is known, so the order can be pre-linked
  let customerId: string | null = null
  if (entry.customerPhone) {
    const existing = await db.query.customers.findFirst({
      where: and(eq(customers.outletId, outletId), eq(customers.phone, entry.customerPhone)),
    })
    if (existing) {
      customerId = existing.id
      if (entry.customerName && !existing.name) {
        await db.update(customers).set({ name: entry.customerName }).where(eq(customers.id, existing.id))
      }
    } else {
      const [created] = await db.insert(customers)
        .values({ outletId, phone: entry.customerPhone, name: entry.customerName })
        .returning()
      customerId = created.id
    }
  }

  await broadcastQueue(outletId)
  return c.json({ ...serializeEntry({ ...updated, table }), customerId })
})

queueRouter.patch("/:id/cancel", requireRole("manager", "owner", "cashier", "captain"), zValidator("json", cancelQueueEntrySchema), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const { status } = c.req.valid("json")

  const entry = await db.query.queueEntries.findFirst({
    where: and(eq(queueEntries.id, id), eq(queueEntries.outletId, outletId)),
  })
  if (!entry) return c.json({ error: "Not found" }, 404)
  if (entry.status !== "waiting") return c.json({ error: "Entry is no longer waiting" }, 400)

  const [updated] = await db.update(queueEntries)
    .set({ status, cancelledAt: new Date() })
    .where(and(eq(queueEntries.id, id), eq(queueEntries.outletId, outletId)))
    .returning()

  await broadcastQueue(outletId)
  return c.json(serializeEntry({ ...updated, table: null }))
})

// ── Reservations endpoints ────────────────────────────────────────────────────

queueRouter.get("/reservations", async (c) => {
  const { outletId } = c.get("user")
  const dateParam = c.req.query("date") // ISO date string, e.g. "2026-06-06"

  let whereClause = eq(reservations.outletId, outletId)
  if (dateParam) {
    const dayStart = new Date(dateParam + "T00:00:00.000Z")
    const dayEnd   = new Date(dateParam + "T23:59:59.999Z")
    whereClause = and(whereClause, gte(reservations.reservedFor, dayStart), lte(reservations.reservedFor, dayEnd))!
  }

  const rows = await db.query.reservations.findMany({
    where: whereClause,
    with: { table: true },
    orderBy: (r, { asc }) => [asc(r.reservedFor)],
  })

  return c.json(rows.map(serializeReservation))
})

const dateQuerySchema = z.object({ date: z.string().optional() })

queueRouter.post("/reservations", requireRole("manager", "owner", "cashier"), zValidator("json", createReservationSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")

  if (data.tableId) {
    const conflict = await checkReservationConflict(outletId, data.tableId, new Date(data.reservedFor))
    if (conflict) return c.json({ error: "Another reservation exists for this table within 90 minutes" }, 409)
  }

  const [res] = await db.insert(reservations).values({
    outletId,
    customerName: data.customerName,
    customerPhone: data.customerPhone ?? null,
    partySize: data.partySize,
    reservedFor: new Date(data.reservedFor),
    tableId: data.tableId ?? null,
    notes: data.notes ?? null,
  }).returning()

  const withTable = await db.query.reservations.findFirst({ where: eq(reservations.id, res.id), with: { table: true } })
  const serialized = serializeReservation(withTable!)
  broadcastOutlet(outletId, { type: "reservation.updated", payload: { reservation: serialized } })
  return c.json(serialized, 201)
})

queueRouter.patch("/reservations/:id", requireRole("manager", "owner", "cashier"), zValidator("json", updateReservationSchema), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const data = c.req.valid("json")

  const existing = await db.query.reservations.findFirst({
    where: and(eq(reservations.id, id), eq(reservations.outletId, outletId)),
  })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const targetTableId = data.tableId !== undefined ? data.tableId : existing.tableId
  const targetTime    = data.reservedFor ? new Date(data.reservedFor) : existing.reservedFor

  if (targetTableId) {
    const conflict = await checkReservationConflict(outletId, targetTableId, targetTime, id)
    if (conflict) return c.json({ error: "Another reservation exists for this table within 90 minutes" }, 409)
  }

  const updateData: Partial<typeof reservations.$inferInsert> = {}
  if (data.customerName  !== undefined) updateData.customerName  = data.customerName
  if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone ?? null
  if (data.partySize     !== undefined) updateData.partySize     = data.partySize
  if (data.reservedFor   !== undefined) updateData.reservedFor   = new Date(data.reservedFor)
  if (data.tableId       !== undefined) updateData.tableId       = data.tableId ?? null
  if (data.notes         !== undefined) updateData.notes         = data.notes ?? null
  if (data.status        !== undefined) updateData.status        = data.status

  await db.update(reservations).set(updateData).where(and(eq(reservations.id, id), eq(reservations.outletId, outletId)))

  const withTable = await db.query.reservations.findFirst({ where: eq(reservations.id, id), with: { table: true } })
  const serialized = serializeReservation(withTable!)
  broadcastOutlet(outletId, { type: "reservation.updated", payload: { reservation: serialized } })
  return c.json(serialized)
})

queueRouter.delete("/reservations/:id", requireRole("manager", "owner", "cashier"), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const existing = await db.query.reservations.findFirst({
    where: and(eq(reservations.id, id), eq(reservations.outletId, outletId)),
  })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const [updated] = await db.update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.id, id), eq(reservations.outletId, outletId)))
    .returning()

  const withTable = await db.query.reservations.findFirst({ where: eq(reservations.id, id), with: { table: true } })
  const serialized = serializeReservation(withTable!)
  broadcastOutlet(outletId, { type: "reservation.updated", payload: { reservation: serialized } })
  return c.body(null, 204)
})

// ── Overlap check helper ──────────────────────────────────────────────────────

async function checkReservationConflict(outletId: string, tableId: string, time: Date, excludeId?: string) {
  const windowMs = 90 * 60 * 1000
  const windowStart = new Date(time.getTime() - windowMs)
  const windowEnd   = new Date(time.getTime() + windowMs)

  const conflicts = await db.query.reservations.findMany({
    where: and(
      eq(reservations.outletId, outletId),
      eq(reservations.tableId, tableId),
      gte(reservations.reservedFor, windowStart),
      lte(reservations.reservedFor, windowEnd),
    ),
  })

  return conflicts.some((r) => r.id !== excludeId && (r.status === "pending" || r.status === "confirmed"))
}
