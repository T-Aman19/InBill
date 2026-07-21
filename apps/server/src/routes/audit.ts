import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { eq, and, gte, lte, like, count } from "drizzle-orm"
import { dateRangeSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { auditEvents } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { dayStart, dayEnd } from "../lib/dateRange.js"
import { logAudit } from "../services/audit.js"

export const auditRouter = new Hono<AppEnv>()

auditRouter.use("*", requireAuth, requireRole("owner", "manager"))

const listAuditQuerySchema = dateRangeSchema.extend({
  // Filter by action prefix, e.g. "bill." matches bill.void + bill.refund
  action: z.string().max(50).optional(),
  page: z.coerce.number().int().positive().default(1),
})

const AUDIT_PAGE_SIZE = 50

auditRouter.get("/", zValidator("query", listAuditQuerySchema), async (c) => {
  const { outletId } = c.get("user")
  const { from, to, action, page } = c.req.valid("query")

  const where = and(
    eq(auditEvents.outletId, outletId),
    gte(auditEvents.createdAt, dayStart(from)),
    lte(auditEvents.createdAt, dayEnd(to)),
    action ? like(auditEvents.action, `${action}%`) : undefined,
  )

  const [rows, countRows] = await Promise.all([
    db.query.auditEvents.findMany({
      where,
      orderBy: (e, { desc }) => [desc(e.createdAt)],
      limit: AUDIT_PAGE_SIZE,
      offset: (page - 1) * AUDIT_PAGE_SIZE,
    }),
    db.select({ value: count() }).from(auditEvents).where(where),
  ])

  return c.json({ events: rows, total: Number(countRows[0]?.value ?? 0), page, pageSize: AUDIT_PAGE_SIZE })
})

// Client-reported events (e.g. receipt reprints happen entirely in the
// browser). Whitelisted so this can't be used to forge arbitrary log lines.
const CLIENT_ACTIONS = new Set(["bill.reprint"])

const clientEventSchema = z.object({
  action: z.string(),
  entity: z.string().max(50),
  entityId: z.string().max(100).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

auditRouter.post("/events", zValidator("json", clientEventSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const { action, entity, entityId, details } = c.req.valid("json")
  if (!CLIENT_ACTIONS.has(action)) return c.json({ error: "Unknown action" }, 400)
  logAudit({ outletId, userId, action, entity, entityId, details })
  return c.json({ ok: true }, 201)
})
