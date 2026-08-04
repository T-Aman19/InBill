import { type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FEATURES, type EntitlementDecision, type FeatureKey } from "@inbill/shared"
import { api } from "@/lib/api"
import { useFeature, isUsable } from "@/hooks/useEntitlement"
import { useUpgradeStore } from "@/stores/upgrade"

// Subscription checkout lives on the marketing site. Deep-link there with the
// owner's token so they arrive already authenticated (the site falls back to a
// login form when there's no token).
function billingBase(): string {
  const override = (import.meta.env as unknown as Record<string, string | undefined>).VITE_BILLING_URL
  if (override) return override
  // Dev heuristic (mirrors lib/api's SERVER_ORIGIN): Vite dev / desktop → local site.
  if (window.location.port === "5173" || window.location.protocol === "tauri:") {
    return "http://localhost:3001/billing"
  }
  return "https://inbill.tresiphi.com/billing"
}
export function billingUrl(): string {
  const token = localStorage.getItem("inbill_owner_token")
  const base = billingBase()
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

// ── inline badges ────────────────────────────────────────────────────────────

export function LockBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
      Pro
    </span>
  )
}

/** "8 left" pill for metered features; renders nothing unless metered. */
export function MeterBadge({ feature }: { feature: FeatureKey }) {
  const d = useFeature(feature)
  if (d.state !== "metered") return null
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
      {d.remaining} of {d.limit} left
    </span>
  )
}

// ── gate wrapper ─────────────────────────────────────────────────────────────

/**
 * Wrap any premium entry point. When usable, renders children untouched. When
 * locked, keeps the feature *visible* but dims it, stamps a Pro badge, and opens
 * the upgrade sheet on click instead of running the action.
 */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const d = useFeature(feature)
  const open = useUpgradeStore((s) => s.open)

  if (d.state === "hidden") return null
  if (isUsable(d)) return <>{children}</>

  return (
    <button
      type="button"
      onClick={() => open(toGate(d))}
      className="group relative block w-full cursor-pointer text-left"
      aria-label={`${d.label} — upgrade to unlock`}
    >
      <div className="pointer-events-none opacity-45 grayscale">{children}</div>
      <span className="absolute right-2 top-2 z-10">
        <LockBadge />
      </span>
    </button>
  )
}

function toGate(d: EntitlementDecision) {
  return {
    feature: d.feature,
    reason: d.reason ?? ("plan_required" as const),
    requiredPlan: d.requiredPlan,
    remaining: d.remaining,
    resetsAt: d.resetsAt,
    trialAvailable: d.trialAvailable,
    trialDays: d.trialDays,
    byok: d.byok,
  }
}

// ── upgrade sheet (mount once at app root) ───────────────────────────────────

export function UpgradeSheet() {
  const gate = useUpgradeStore((s) => s.gate)
  const close = useUpgradeStore((s) => s.close)
  const qc = useQueryClient()

  const trial = useMutation({
    mutationFn: (feature: string) => api.entitlements.startTrial(feature),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entitlements"] })
      close()
    },
  })

  if (!gate) return null
  const def = FEATURES[gate.feature as FeatureKey]

  const headline =
    gate.reason === "quota_exhausted"
      ? "You've used your free quota this month"
      : gate.reason === "trial_expired"
        ? "Your free trial has ended"
        : `${def.label} is a paid feature`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <LockBadge />
          <h2 className="text-lg font-semibold text-neutral-900">{def.label}</h2>
        </div>
        <p className="text-sm leading-relaxed text-neutral-600">{def.pitch}</p>

        {gate.reason === "quota_exhausted" && gate.resetsAt && (
          <p className="mt-3 text-xs text-neutral-500">
            Resets on {new Date(gate.resetsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {gate.requiredPlan && (
            <a
              href={billingUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-amber-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-amber-600"
            >
              Upgrade to {gate.requiredPlan[0]!.toUpperCase() + gate.requiredPlan.slice(1)}
            </a>
          )}

          {gate.trialAvailable && gate.trialDays && (
            <button
              type="button"
              disabled={trial.isPending}
              onClick={() => trial.mutate(gate.feature)}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {trial.isPending ? "Starting…" : `Start ${gate.trialDays}-day free trial`}
            </button>
          )}

          {gate.byok && (
            <a
              href="/manager/settings#api-keys"
              className="rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Use your own API key — free & unlimited
            </a>
          )}

          <button type="button" onClick={close} className="mt-1 py-2 text-sm text-neutral-500 hover:text-neutral-700">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
