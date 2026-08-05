import { type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FEATURES, type EntitlementDecision, type FeatureKey } from "@inbill/shared"
import { api } from "@/lib/api"
import { useFeature, isUsable } from "@/hooks/useEntitlement"
import { useUpgradeStore } from "@/stores/upgrade"

// ── inline badges ────────────────────────────────────────────────────────────

export function LockBadge() {
  return <span className="badge amber">Pro</span>
}

/** "8 left" pill for metered features; renders nothing unless metered. */
export function MeterBadge({ feature }: { feature: FeatureKey }) {
  const d = useFeature(feature)
  if (d.state !== "metered") return null
  return <span className="badge">{d.remaining} of {d.limit} left</span>
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
  const navigate = useNavigate()
  const isOwner = !!localStorage.getItem("inbill_owner_token")

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
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", padding: 16 }}
      onClick={close}
    >
      <div
        style={{ width: "100%", maxWidth: 400, background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <LockBadge />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>{def.label}</h2>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-ink-3)", margin: 0 }}>{def.pitch}</p>

        {gate.reason === "quota_exhausted" && gate.resetsAt && (
          <p style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 12 }}>
            Resets on {new Date(gate.resetsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          {gate.requiredPlan && (
            isOwner ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => { close(); navigate({ to: "/owner/billing" }) }}
                style={{ height: 44, justifyContent: "center", fontSize: 14 }}
              >
                Upgrade to {gate.requiredPlan[0]!.toUpperCase() + gate.requiredPlan.slice(1)}
              </button>
            ) : (
              <p style={{ background: "var(--color-surface-2)", borderRadius: 10, padding: "12px 16px", textAlign: "center", fontSize: 13, color: "var(--color-ink-2)", margin: 0 }}>
                Ask your account owner to upgrade the InBill plan from the Owner Dashboard.
              </p>
            )
          )}

          {gate.trialAvailable && gate.trialDays && (
            <button
              type="button"
              className="btn ghost"
              disabled={trial.isPending}
              onClick={() => trial.mutate(gate.feature)}
              style={{ height: 44, justifyContent: "center", fontSize: 14, fontWeight: 600 }}
            >
              {trial.isPending ? "Starting…" : `Start ${gate.trialDays}-day free trial`}
            </button>
          )}

          {gate.byok && (
            <a
              href="/manager/settings#api-keys"
              className="btn ghost"
              style={{ height: 44, justifyContent: "center", fontSize: 13, textDecoration: "none" }}
            >
              Use your own API key — free & unlimited
            </a>
          )}

          <button type="button" onClick={close} style={{ marginTop: 2, padding: "8px 0", background: "none", border: "none", fontSize: 13, color: "var(--color-ink-3)", cursor: "pointer" }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
