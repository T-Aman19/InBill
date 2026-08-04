import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import {
  subscribeSchema,
  planCycleKey,
  type BillingCycle,
  type PlanId,
  type PurchasablePlan,
} from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { owners, subscriptions, billingWebhookEvents } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { config } from "../config.js"
import {
  createCustomer,
  createSubscription,
  cancelSubscription,
  verifyWebhookSignature,
  RazorpayError,
} from "../lib/razorpay.js"

export const subscriptionsRouter = new Hono<AppEnv>()

type SubStatus = "trialing" | "active" | "past_due" | "canceled"

// Map a Razorpay subscription.status to our enum. Anything that isn't a live,
// paid state resolves to a status that loadContext treats as free.
function mapStatus(rzpStatus: string): SubStatus {
  switch (rzpStatus) {
    case "active":
    case "authenticated": // mandate approved & first charge done → treat as active
      return "active"
    case "pending": // a renewal charge failed, Razorpay is retrying
    case "halted": // retries exhausted
    case "paused":
      return "past_due"
    case "cancelled":
    case "completed": // ran to the end of total_count
    case "expired":
      return "canceled"
    default: // "created" (pre-authorization) & anything unknown → not yet paid
      return "past_due"
  }
}

// Reverse the config plan-id map: Razorpay plan_id → our (plan, cycle).
function lookupPlan(rzpPlanId: string): { plan: PurchasablePlan; cycle: BillingCycle } | null {
  for (const [key, id] of Object.entries(config.razorpay.planIds)) {
    if (id && id === rzpPlanId) {
      const [plan, cycle] = key.split("_") as [PurchasablePlan, BillingCycle]
      return { plan, cycle }
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook — Razorpay → us. Registered BEFORE requireAuth so it stays public;
// authenticity comes from the HMAC signature, not a JWT. Keeps the subscriptions
// row truthful; it never touches entitlement logic (loadContext derives the rest).
// ─────────────────────────────────────────────────────────────────────────────
subscriptionsRouter.post("/webhook", async (c) => {
  const raw = await c.req.text()
  const signature = c.req.header("x-razorpay-signature")
  if (!verifyWebhookSignature(raw, signature)) {
    return c.json({ error: "Invalid signature" }, 401)
  }

  const eventId = c.req.header("x-razorpay-event-id") ?? ""
  // Fast idempotency short-circuit (Razorpay retries deliveries).
  if (eventId) {
    const seen = await db.query.billingWebhookEvents.findFirst({ where: eq(billingWebhookEvents.id, eventId) })
    if (seen) return c.json({ ok: true, deduped: true })
  }

  let body: any
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: "Bad payload" }, 400)
  }

  const event: string = body?.event ?? ""
  // We only act on subscription lifecycle events; everything else is acknowledged.
  if (event.startsWith("subscription.")) {
    const entity = body?.payload?.subscription?.entity
    if (entity?.id) {
      // Find our row by the Razorpay subscription id, falling back to the ownerId
      // we stashed in notes at creation time.
      let row = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.razorpaySubscriptionId, entity.id),
      })
      const ownerId: string | undefined = entity?.notes?.ownerId
      if (!row && ownerId) {
        row = await db.query.subscriptions.findFirst({ where: eq(subscriptions.ownerId, ownerId) })
      }

      if (row) {
        const mapped = lookupPlan(entity.plan_id)
        const currentEnd: number | null = entity.current_end ?? null
        await db
          .update(subscriptions)
          .set({
            status: mapStatus(entity.status),
            ...(mapped ? { plan: mapped.plan as PlanId, cycle: mapped.cycle } : {}),
            razorpaySubscriptionId: entity.id,
            ...(currentEnd ? { currentPeriodEnd: new Date(currentEnd * 1000) } : {}),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, row.id))
      } else {
        console.warn(`[billing] webhook ${event} for unknown subscription ${entity.id}`)
      }
    }
  }

  // Record the event id so retries are ignored. Idempotent updates above mean a
  // double-process is harmless, but this keeps redeliveries cheap.
  if (eventId) {
    await db
      .insert(billingWebhookEvents)
      .values({ id: eventId, eventType: event })
      .onConflictDoNothing()
  }

  return c.json({ ok: true })
})

// ── owner-authenticated below ────────────────────────────────────────────────
subscriptionsRouter.use("*", requireAuth, requireRole("owner"))

// Current subscription for the signed-in owner — powers the billing page & POS badge.
subscriptionsRouter.get("/subscription", async (c) => {
  const { ownerId } = c.get("user")
  if (config.isLocal) return c.json({ plan: "self_hosted", status: "active", selfHosted: true })

  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.ownerId, ownerId) })
  if (!sub) return c.json({ plan: "free", status: "active" })

  const effectivePlan = sub.status === "past_due" || sub.status === "canceled" ? "free" : sub.plan
  return c.json({
    plan: effectivePlan, // what gating actually grants right now
    subscribedPlan: sub.plan, // the plan they're paying for (may differ pre-activation/lapsed)
    cycle: sub.cycle,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  })
})

// Start a subscription. Creates/reuses a Razorpay customer + subscription and
// returns the hosted mandate-authorization URL for the website to redirect to.
subscriptionsRouter.post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
  const { ownerId } = c.get("user")
  const { plan, cycle } = c.req.valid("json")

  const planId = config.razorpay.planIds[planCycleKey(plan, cycle)]
  if (!planId) return c.json({ error: "This plan isn't available for purchase yet" }, 400)

  const owner = await db.query.owners.findFirst({ where: eq(owners.id, ownerId) })
  if (!owner) return c.json({ error: "Owner not found" }, 404)

  const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.ownerId, ownerId) })
  if (existing && (existing.status === "active" || existing.status === "trialing") && existing.razorpaySubscriptionId) {
    // Upgrades/downgrades go through change-plan (not yet built), not a fresh subscribe.
    return c.json({ error: "You already have an active subscription", code: "already_subscribed" }, 409)
  }

  try {
    let customerId = existing?.razorpayCustomerId ?? null
    if (!customerId) {
      const customer = await createCustomer({ name: owner.name, email: owner.email, contact: owner.phone })
      customerId = customer.id
    }

    // Razorpay requires a bounded total_count (billing cycles). Set it high so it
    // effectively runs until cancelled.
    const totalCount = cycle === "annual" ? 10 : 120
    const sub = await createSubscription({ planId, customerId, totalCount, notes: { ownerId } })

    // Persist intent. Status stays non-active until the webhook confirms payment,
    // so features don't unlock before the mandate is charged.
    const values = {
      ownerId,
      plan,
      cycle,
      status: "past_due" as const, // = "awaiting first charge"; treated as free by gating
      cancelAtPeriodEnd: false,
      razorpayCustomerId: customerId,
      razorpaySubscriptionId: sub.id,
      updatedAt: new Date(),
    }
    await db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.ownerId, set: values })

    return c.json({ subscriptionId: sub.id, shortUrl: sub.short_url, razorpayKeyId: config.razorpay.keyId })
  } catch (err) {
    if (err instanceof RazorpayError) return c.json({ error: err.message }, 502)
    throw err
  }
})

// Cancel at the end of the current paid period (keeps access until then).
subscriptionsRouter.post("/cancel", async (c) => {
  const { ownerId } = c.get("user")
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.ownerId, ownerId) })
  if (!sub?.razorpaySubscriptionId) return c.json({ error: "No active subscription" }, 404)

  try {
    await cancelSubscription(sub.razorpaySubscriptionId, true)
  } catch (err) {
    if (err instanceof RazorpayError) return c.json({ error: err.message }, 502)
    throw err
  }
  await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscriptions.ownerId, ownerId))
  return c.json({ ok: true, cancelAtPeriodEnd: true })
})
