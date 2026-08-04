import { useState, useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CatalogPlan, BillingCycle } from "@inbill/shared"
import { api } from "@/lib/api"
import { LogoMark } from "@/components/ui/LogoMark"
import { loadRazorpayCheckout, openRazorpayCheckout } from "@/lib/razorpayCheckout"
import { formatCurrencyInt } from "@/lib/utils"

type CheckoutState = "idle" | "creating" | "awaiting_payment" | "confirming" | "confirmed" | "dismissed" | "error"

const POLL_INTERVAL_MS = 2500
const POLL_MAX_ATTEMPTS = 18 // ~45s

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function OwnerBillingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [cycle, setCycle] = useState<BillingCycle>("monthly")
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle")
  const [checkoutPlanName, setCheckoutPlanName] = useState("")
  const [checkoutError, setCheckoutError] = useState("")

  useEffect(() => {
    if (!localStorage.getItem("inbill_owner_token")) navigate({ to: "/owner/login" })
  }, [navigate])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing.getSubscription,
  })
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: api.billing.getPlans,
    staleTime: 60 * 60_000,
  })
  const { data: owner } = useQuery({ queryKey: ["owner-me"], queryFn: api.owner.me })

  function startConfirmPolling() {
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const res = await api.billing.getSubscription()
        if (res.status === "active" || res.status === "trialing") {
          clearInterval(pollRef.current!)
          qc.setQueryData(["billing", "subscription"], res)
          setCheckoutState("confirmed")
          return
        }
      } catch {
        // ignore transient poll errors, keep trying until the attempt cap
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(pollRef.current!)
        setCheckoutState("error")
        setCheckoutError("Still confirming — this can take a minute. Refresh this page shortly, or contact support if it doesn't update.")
      }
    }, POLL_INTERVAL_MS)
  }

  const subscribeMutation = useMutation({
    mutationFn: (input: { plan: string; cycle: BillingCycle }) => api.billing.subscribe(input.plan, input.cycle),
    onSuccess: async (res) => {
      try {
        await loadRazorpayCheckout()
      } catch (e) {
        setCheckoutState("error")
        setCheckoutError((e as Error).message)
        return
      }
      setCheckoutState("awaiting_payment")
      const result = await openRazorpayCheckout({
        key: res.razorpayKeyId,
        subscription_id: res.subscriptionId,
        name: "InBill",
        description: checkoutPlanName ? `${checkoutPlanName} · ${cycle}` : undefined,
        prefill: owner ? { name: owner.name, email: owner.email, contact: owner.phone } : undefined,
      })
      if (result.status === "paid") {
        setCheckoutState("confirming")
        startConfirmPolling()
      } else {
        setCheckoutState("dismissed")
      }
    },
    onError: (e: Error) => {
      setCheckoutState("error")
      setCheckoutError(e.message)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: api.billing.cancel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing", "subscription"] }),
    onError: (e: Error) => setCheckoutError(e.message),
  })

  function handleSubscribe(plan: CatalogPlan) {
    const price = plan.prices[cycle]
    if (price == null) return
    setCheckoutPlanName(plan.name)
    setCheckoutError("")
    setCheckoutState("creating")
    subscribeMutation.mutate({ plan: plan.id, cycle })
  }

  function handleCancel() {
    const planLabel = sub?.subscribedPlan ?? sub?.plan ?? "current"
    const until = sub?.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "the end of the billing period"
    if (!confirm(`Cancel your ${planLabel} plan? You'll keep access until ${until}.`)) return
    cancelMutation.mutate()
  }

  function dismissBanner() {
    setCheckoutState("idle")
    setCheckoutError("")
  }

  const isLoading = subLoading || catalogLoading
  const hasLivePaidSub = !!sub && sub.plan !== "free" && sub.plan !== "self_hosted" && (sub.status === "active" || sub.status === "trialing")
  const isAbandonedAttempt = !!sub && sub.status === "past_due" && !!sub.subscribedPlan && sub.subscribedPlan !== "free"
  const busy = checkoutState === "creating" || checkoutState === "awaiting_payment"

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 64, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 28px", gap: 12, flexShrink: 0 }}>
        <button
          className="btn ghost"
          onClick={() => navigate({ to: "/owner/dashboard" })}
          style={{ padding: "0 10px", height: 34, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Dashboard
        </button>
        <div style={{ width: 1, height: 22, background: "var(--color-line)", margin: "0 4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "var(--color-ink)", flexShrink: 0 }}>
            <LogoMark size={24} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>Billing &amp; Plan</span>
        </div>
      </header>

      <main style={{ padding: 32, overflow: "auto", flex: 1 }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          {isLoading ? (
            <p style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</p>
          ) : sub?.selfHosted ? (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 28, maxWidth: 520 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-ink)", marginBottom: 8 }}>Self-hosted</div>
              <p style={{ fontSize: 14, color: "var(--color-ink-2)", lineHeight: 1.5, margin: 0 }}>
                You&apos;re running the open-source build — every feature is unlocked and there&apos;s nothing to pay.
              </p>
            </div>
          ) : (
            <>
              {checkoutState !== "idle" && (
                <div
                  style={{
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    borderRadius: 10,
                    fontSize: 13,
                    border: `1px solid ${checkoutState === "error" ? "var(--color-red)" : checkoutState === "confirmed" ? "var(--color-green)" : "var(--color-line-strong)"}`,
                    background: checkoutState === "error" ? "var(--color-red-soft, #fee2e2)" : checkoutState === "confirmed" ? "var(--color-green-soft, #dcfce7)" : "var(--color-surface-2)",
                  }}
                >
                  <span style={{ flex: 1, color: "var(--color-ink)" }}>
                    {checkoutState === "creating" && "Setting up checkout…"}
                    {checkoutState === "awaiting_payment" && "Complete your payment in the Razorpay window…"}
                    {checkoutState === "confirming" && "Confirming your payment — this can take a moment…"}
                    {checkoutState === "confirmed" && `You're all set — welcome to ${checkoutPlanName || "your new plan"}!`}
                    {checkoutState === "dismissed" && "Checkout cancelled — you can try again anytime."}
                    {checkoutState === "error" && (checkoutError || "Something went wrong.")}
                  </span>
                  {!busy && checkoutState !== "confirming" && (
                    <button onClick={dismissBanner} className="btn ghost" style={{ height: 28, padding: "0 10px", fontSize: 12 }}>Dismiss</button>
                  )}
                </div>
              )}

              {hasLivePaidSub ? (
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 24, maxWidth: 520 }}>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>Current plan</div>
                  <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: "var(--color-ink)" }}>
                    {sub!.plan[0]!.toUpperCase() + sub!.plan.slice(1)}
                    {sub?.cycle ? <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink-3)" }}> · {sub.cycle}</span> : null}
                  </div>
                  {sub?.currentPeriodEnd && (
                    <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 6 }}>
                      {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} on {fmtDate(sub.currentPeriodEnd)}
                    </div>
                  )}
                  {!sub?.cancelAtPeriodEnd ? (
                    <button
                      onClick={handleCancel}
                      disabled={cancelMutation.isPending}
                      className="btn ghost"
                      style={{ marginTop: 18, height: 38, fontSize: 13, color: "var(--color-red)" }}
                    >
                      {cancelMutation.isPending ? "Cancelling…" : "Cancel plan"}
                    </button>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 18 }}>Cancellation scheduled — you'll keep access until the date above.</p>
                  )}
                  <p style={{ fontSize: 12.5, color: "var(--color-ink-3)", marginTop: 14, lineHeight: 1.5 }}>
                    Want to switch plans? Cancel your current plan first, or contact support — plan changes while subscribed aren&apos;t self-serve yet.
                  </p>
                </div>
              ) : (
                <>
                  {isAbandonedAttempt && (
                    <div style={{ marginBottom: 20, padding: "10px 14px", borderRadius: 10, background: "var(--color-amber-soft, #fff8e1)", border: "1px solid var(--color-amber, #f59e0b)", fontSize: 12.5, color: "var(--color-amber-dark, #92400e)" }}>
                      You started subscribing to {sub!.subscribedPlan} but payment wasn&apos;t completed. Pick a plan below to try again.
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", margin: 0 }}>Choose a plan</h2>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["monthly", "annual"] as BillingCycle[]).map((c) => (
                        <button
                          key={c}
                          onClick={() => setCycle(c)}
                          style={{
                            fontSize: 12,
                            fontWeight: cycle === c ? 600 : 400,
                            padding: "5px 14px",
                            borderRadius: 9999,
                            border: cycle === c ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                            background: cycle === c ? "var(--color-ink)" : "transparent",
                            color: cycle === c ? "#fff" : "var(--color-ink-3)",
                            cursor: "pointer",
                            textTransform: "capitalize",
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!catalog?.plans.length ? (
                    <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Plans aren&apos;t configured yet — check back soon.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                      {catalog.plans.map((plan) => {
                        const price = plan.prices[cycle]
                        const available = price != null
                        return (
                          <div
                            key={plan.id}
                            style={{
                              background: "var(--color-surface)",
                              border: plan.featured ? "1.5px solid var(--color-accent)" : "1px solid var(--color-line)",
                              borderRadius: 14,
                              padding: 22,
                              display: "flex",
                              flexDirection: "column",
                              gap: 12,
                              boxShadow: plan.featured ? "0 0 0 3px var(--color-accent-soft)" : undefined,
                            }}
                          >
                            {plan.featured && (
                              <span style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-accent-ink)", background: "var(--color-accent-soft)", borderRadius: 9999, padding: "3px 9px" }}>
                                Most popular
                              </span>
                            )}
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>{plan.name}</div>
                              {plan.tag && <div style={{ fontSize: 12.5, color: "var(--color-ink-3)", marginTop: 2 }}>{plan.tag}</div>}
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }}>
                              {available ? formatCurrencyInt(price!) : "—"}
                              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-3)" }}> /{cycle === "monthly" ? "mo" : "yr"}</span>
                            </div>
                            {plan.bullets.length > 0 && (
                              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                                {plan.bullets.map((b) => (
                                  <li key={b} style={{ fontSize: 13, color: "var(--color-ink-2)", display: "flex", gap: 8 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12"/></svg>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <button
                              className="btn primary"
                              disabled={!available || busy}
                              onClick={() => handleSubscribe(plan)}
                              style={{ height: 40, justifyContent: "center", marginTop: "auto" }}
                            >
                              {!available ? `Not available ${cycle}` : busy && checkoutPlanName === plan.name ? "Starting…" : "Subscribe"}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
