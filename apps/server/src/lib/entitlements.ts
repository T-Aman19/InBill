import { and, eq, sql } from "drizzle-orm"
import {
  FEATURES,
  PLAN_ORDER,
  featureKeys,
  planMeets,
  type EntitlementDecision,
  type FeatureDef,
  type FeatureKey,
  type PlanId,
} from "@inbill/shared"

type MeterLimits = Partial<Record<PlanId, number>>
import { db } from "../db/index.js"
import { subscriptions, usageCounters, featureTrials } from "../db/schema/index.js"
import { config } from "../config.js"

// ── date helpers (app timezone) ──────────────────────────────────────────────

function ymd(now = new Date()): { period: string; resetsAt: string } {
  // Format the current year-month in the business timezone so quotas reset on
  // the local month boundary, not UTC's.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === "year")!.value)
  const month = Number(parts.find((p) => p.type === "month")!.value)
  const period = `${year}-${String(month).padStart(2, "0")}`
  // First instant of next month (approximate — UTC midnight is fine for display).
  const resetsAt = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)).toISOString()
  return { period, resetsAt }
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000))
}

// ── context loading ──────────────────────────────────────────────────────────

type Ctx = {
  plan: PlanId
  period: string
  resetsAt: string
  counters: Map<string, number>
  trials: Map<string, Date>
}

async function loadContext(ownerId: string): Promise<Ctx> {
  const { period, resetsAt } = ymd()
  const [sub, counterRows, trialRows] = await Promise.all([
    db.query.subscriptions.findFirst({ where: eq(subscriptions.ownerId, ownerId) }),
    db.select().from(usageCounters).where(and(eq(usageCounters.ownerId, ownerId), eq(usageCounters.period, period))),
    db.select().from(featureTrials).where(eq(featureTrials.ownerId, ownerId)),
  ])
  return {
    // A past_due/canceled subscription drops the account back to free.
    plan: sub && sub.status !== "past_due" && sub.status !== "canceled" ? sub.plan : "free",
    period,
    resetsAt,
    counters: new Map(counterRows.map((r) => [r.feature, r.count])),
    trials: new Map(trialRows.map((r) => [r.feature, r.endsAt])),
  }
}

// ── the pure decision function ───────────────────────────────────────────────

/** Lowest plan above `plan` whose meter is unlimited (absent from the limits map). */
function nextUnlimitedPlan(limits: MeterLimits, plan: PlanId): PlanId | undefined {
  return PLAN_ORDER.slice(PLAN_ORDER.indexOf(plan) + 1).find((p) => limits[p] === undefined)
}

function decide(feature: FeatureKey, ctx: Ctx): EntitlementDecision {
  const def = FEATURES[feature] as FeatureDef
  const base = { feature, label: def.label, plan: ctx.plan } as const

  if (def.mode === "open") return { ...base, state: "allowed" }

  if (def.mode === "plan") {
    if (planMeets(ctx.plan, def.minPlan!)) return { ...base, state: "allowed" }
    return {
      ...base,
      state: def.visibility === "hide" ? "hidden" : "locked",
      reason: "plan_required",
      requiredPlan: def.minPlan,
    }
  }

  if (def.mode === "trial") {
    if (planMeets(ctx.plan, def.minPlan!)) return { ...base, state: "allowed" }
    const endsAt = ctx.trials.get(feature)
    if (endsAt && endsAt.getTime() > Date.now()) {
      return { ...base, state: "trial", trialEndsAt: endsAt.toISOString(), daysLeft: daysBetween(new Date(), endsAt) }
    }
    return {
      ...base,
      state: "locked",
      reason: endsAt ? "trial_expired" : "plan_required",
      requiredPlan: def.minPlan,
      trialAvailable: !endsAt,
      trialDays: def.trialDays,
    }
  }

  // mode === "meter"
  const limit = def.meter!.limits[ctx.plan]
  if (limit === undefined) return { ...base, state: "allowed" } // unlimited on this plan
  const used = ctx.counters.get(feature) ?? 0
  const remaining = Math.max(0, limit - used)
  if (remaining > 0) {
    return { ...base, state: "metered", limit, used, remaining, resetsAt: ctx.resetsAt, byok: def.byok }
  }
  return {
    ...base,
    state: "locked",
    reason: "quota_exhausted",
    limit,
    used,
    remaining: 0,
    resetsAt: ctx.resetsAt,
    requiredPlan: nextUnlimitedPlan(def.meter!.limits, ctx.plan),
    byok: def.byok,
  }
}

// ── public API ───────────────────────────────────────────────────────────────

/** Everything is unlocked when self-hosted — the OSS build is never gated. */
function selfHosted(feature: FeatureKey): EntitlementDecision {
  return { feature, label: FEATURES[feature].label, state: "allowed", plan: "self_hosted" }
}

export async function resolveFeature(ownerId: string, feature: FeatureKey): Promise<EntitlementDecision> {
  if (config.isLocal) return selfHosted(feature)
  return decide(feature, await loadContext(ownerId))
}

export async function getSnapshot(ownerId: string): Promise<EntitlementDecision[]> {
  if (config.isLocal) return featureKeys.map(selfHosted)
  const ctx = await loadContext(ownerId)
  return featureKeys.map((f) => decide(f, ctx))
}

/** Increment a metered feature's monthly tally. No-op when self-hosted or unmetered. */
export async function consumeFeature(ownerId: string, feature: FeatureKey): Promise<void> {
  if (config.isLocal) return
  const def = FEATURES[feature] as FeatureDef
  if (def.mode !== "meter") return
  const { plan } = await loadContext(ownerId)
  if (def.meter!.limits[plan] === undefined) return // unlimited — nothing to track
  const { period } = ymd()
  await db
    .insert(usageCounters)
    .values({ ownerId, feature, period, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.ownerId, usageCounters.feature, usageCounters.period],
      set: { count: sql`${usageCounters.count} + 1`, updatedAt: new Date() },
    })
}

/** Start a per-feature free trial (trial-mode features only). Idempotent-ish: rejects if one exists. */
export async function startTrial(ownerId: string, feature: FeatureKey): Promise<EntitlementDecision> {
  const def = FEATURES[feature] as FeatureDef
  if (config.isLocal) return selfHosted(feature)
  if (def.mode !== "trial" || !def.trialDays) throw new Error("Feature is not trial-eligible")
  const existing = await db.query.featureTrials.findFirst({
    where: and(eq(featureTrials.ownerId, ownerId), eq(featureTrials.feature, feature)),
  })
  if (existing) throw new Error("Trial already used")
  const endsAt = new Date(Date.now() + def.trialDays * 86_400_000)
  await db.insert(featureTrials).values({ ownerId, feature, endsAt })
  return resolveFeature(ownerId, feature)
}
