import { z } from "zod"

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements — the single source of truth for what each plan can do.
//
// IMPORTANT: gating is only ever enforced on the managed cloud. A self-hosted /
// desktop server (DEPLOYMENT_MODE=local) always resolves every feature to
// "allowed" — the open-source build is never crippled. See the server's
// lib/entitlements.ts short-circuit.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_ORDER = ["free", "starter", "growth", "enterprise"] as const
export type PlanId = (typeof PLAN_ORDER)[number]

export const planIndex = (p: PlanId) => PLAN_ORDER.indexOf(p)
/** Does `have` satisfy the `need` tier (equal or higher)? */
export const planMeets = (have: PlanId, need: PlanId) => planIndex(have) >= planIndex(need)

/** How a feature is gated. */
export type GateMode =
  | "open" // in every plan, incl. free — never gated
  | "plan" // hard gate: requires minPlan
  | "trial" // requires minPlan, but any lower plan can run a time-boxed trial
  | "meter" // usable up to a per-plan monthly quota (0 quota = locked)

export type FeatureDef = {
  label: string
  /** One-liner shown in the upgrade sheet. */
  pitch: string
  mode: GateMode
  /** Plan required for unlimited/native access (plan + trial modes). */
  minPlan?: PlanId
  /** Free-trial length in days (trial mode). */
  trialDays?: number
  /** Monthly quota per plan; a plan absent from the map is unlimited (meter mode). */
  meter?: { period: "month"; limits: Partial<Record<PlanId, number>> }
  /** Metered feature can be unlocked for free by supplying your own API key. */
  byok?: boolean
  /** Locked features are shown with an upsell by default; "hide" removes them. */
  visibility?: "show" | "hide"
}

// The catalog. Add a key here → it exists everywhere (server gate + client UI).
export const FEATURES = {
  ai_menu_extract: {
    label: "AI menu import",
    pitch: "Photograph a menu and we build your catalog — items, prices, variants.",
    mode: "meter",
    byok: true,
    meter: { period: "month", limits: { free: 10, starter: 100 } },
  },
  ai_menu_description: {
    label: "AI item descriptions",
    pitch: "Auto-write appetising menu copy for any dish.",
    mode: "meter",
    byok: true,
    meter: { period: "month", limits: { free: 10, starter: 200 } },
  },
  ai_reports: {
    label: "Ask your data",
    pitch: "Natural-language answers about sales, items and payments.",
    mode: "meter",
    byok: true,
    meter: { period: "month", limits: { free: 10, starter: 300 } },
  },
  ai_upsell: {
    label: "AI upsell suggestions",
    pitch: "Context-aware add-on prompts at the point of order.",
    mode: "trial",
    minPlan: "growth",
    trialDays: 14,
  },
  whatsapp_receipts: {
    label: "WhatsApp receipts",
    pitch: "Send the bill to the guest's phone before they stand up.",
    mode: "meter",
    byok: true,
    meter: { period: "month", limits: { free: 0, starter: 500 } },
  },
  whatsapp_campaigns: {
    label: "WhatsApp campaigns",
    pitch: "Win-back and offer blasts to your customer list.",
    mode: "trial",
    minPlan: "growth",
    trialDays: 14,
  },
  aggregators: {
    label: "Aggregator sync",
    pitch: "Swiggy, Zomato and ONDC orders on the same floor and KDS.",
    mode: "plan",
    minPlan: "growth",
  },
  kitchen_stations: {
    label: "Kitchen stations",
    pitch: "Route each dish to its own station — separate tickets for tandoor, curries, bar and more.",
    mode: "plan",
    minPlan: "growth",
  },
  hosted_backups: {
    label: "Hosted backups",
    pitch: "Nightly off-site backups and point-in-time restore.",
    mode: "plan",
    minPlan: "starter",
  },
  multi_outlet: {
    label: "Multi-outlet cloud",
    pitch: "Central menu, pricing and consolidated cross-outlet reporting.",
    mode: "plan",
    minPlan: "growth",
  },
  advanced_analytics: {
    label: "Advanced analytics",
    pitch: "Cohorts, forecasting and item-level margin dashboards.",
    mode: "trial",
    minPlan: "growth",
    trialDays: 14,
  },
  sso: {
    label: "SSO & audit export",
    pitch: "SAML sign-in and compliance-grade audit exports.",
    mode: "plan",
    minPlan: "enterprise",
    visibility: "hide",
  },
} as const satisfies Record<string, FeatureDef>

export type FeatureKey = keyof typeof FEATURES
export const featureKeys = Object.keys(FEATURES) as FeatureKey[]

// ── Runtime decision (server → client) ───────────────────────────────────────

export type EntitlementState =
  | "allowed" // use it
  | "trial" // inside a running trial (daysLeft)
  | "metered" // allowed, consuming quota (remaining)
  | "locked" // visible, needs an upgrade / trial start
  | "hidden" // don't render

export type GateReason = "plan_required" | "trial_expired" | "quota_exhausted"

// Optional fields allow explicit `undefined` so the server can spread a single
// decision literal under `exactOptionalPropertyTypes`.
export type EntitlementDecision = {
  feature: FeatureKey
  label: string
  state: EntitlementState
  /** Effective plan, or "self_hosted" when the server runs in local mode. */
  plan: PlanId | "self_hosted"
  reason?: GateReason | undefined
  // meter
  limit?: number | undefined
  used?: number | undefined
  remaining?: number | undefined
  resetsAt?: string | undefined
  // trial
  trialEndsAt?: string | undefined
  daysLeft?: number | undefined
  trialAvailable?: boolean | undefined
  trialDays?: number | undefined
  // upsell
  requiredPlan?: PlanId | undefined
  byok?: boolean | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription billing (managed cloud). Checkout is native — built into the
// Owner Dashboard (apps/pos) via Razorpay Checkout.js. These types are shared
// so the server route and the POS agree on plans/cycles/catalog shape.
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_CYCLES = ["monthly", "annual"] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

/** Plans a customer can self-serve purchase. free = default, enterprise = sales-led. */
export const PURCHASABLE_PLANS = ["starter", "growth"] as const
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number]

/**
 * Display pricing, in paise (₹1 = 100 paise), matching the Razorpay Plans in the
 * dashboard. Superseded as the live pricing source by GET /billing/plans (which
 * reads name/price straight from Razorpay) — kept only as a static fallback.
 */
export const PLAN_PRICING: Record<PurchasablePlan, Record<BillingCycle, number>> = {
  starter: { monthly: 69_900, annual: 699_000 },
  growth: { monthly: 179_900, annual: 1_799_000 },
}

/** Config/plan-map key for a (tier, cycle) pair, e.g. "growth_annual". */
export const planCycleKey = (plan: string, cycle: BillingCycle) => `${plan}_${cycle}` as const

/** Live pricing/marketing catalog for a plan tier, served by GET /billing/plans. */
export type CatalogPlan = {
  id: string // tier key
  name: string
  tag: string
  featured: boolean
  bullets: string[]
  prices: Partial<Record<BillingCycle, number>> // rupees, ex-GST
}

// `plan` is any configured tier string — the server validates it against the
// Razorpay plan-id map (unknown/unconfigured tiers are rejected there).
export const subscribeSchema = z.object({
  plan: z.string().min(1),
  cycle: z.enum(BILLING_CYCLES),
})
export type SubscribeInput = z.infer<typeof subscribeSchema>

/** Body returned with HTTP 402 when a gated route is denied. */
export const gateErrorSchema = z.object({
  error: z.string(),
  gate: z.object({
    feature: z.string(),
    reason: z.enum(["plan_required", "trial_expired", "quota_exhausted"]),
    requiredPlan: z.enum(PLAN_ORDER).optional(),
    remaining: z.number().optional(),
    resetsAt: z.string().optional(),
    trialAvailable: z.boolean().optional(),
    trialDays: z.number().optional(),
    byok: z.boolean().optional(),
  }),
})
export type GateError = z.infer<typeof gateErrorSchema>
