import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { auditEvents, users } from "../db/schema/index.js"

// Fire-and-forget: audit logging must never break or slow down the action
// being logged, so failures are swallowed after a console error.
export function logAudit(opts: {
  outletId: string
  userId?: string | null | undefined
  action: string
  entity: string
  entityId?: string | null | undefined
  details?: Record<string, unknown> | undefined
}): void {
  void (async () => {
    let userName: string | null = null
    if (opts.userId) {
      const u = await db.query.users.findFirst({ where: eq(users.id, opts.userId), columns: { name: true } })
      userName = u?.name ?? null
    }
    await db.insert(auditEvents).values({
      outletId: opts.outletId,
      userId: opts.userId ?? null,
      userName,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      details: opts.details ?? {},
    })
  })().catch((err) => console.error("[audit] failed to record event:", err))
}
