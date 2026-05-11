import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"

type KotModifier = { name: string; price: string }
type KotItem = { id: string; name: string; variantName?: string | null; quantity: number; notes?: string | null; modifiers: KotModifier[] }
type Kot     = { id: string; kotNumber: number; status: string; createdAt: string; items: KotItem[] }

function KDSColumn({
  title, accent, kots, actionLabel, onAction, now, stage,
}: {
  title: string; accent: string; kots: Kot[]
  actionLabel: string; onAction: (id: string) => void; now: number; stage: string
}) {
  return (
    <div style={{
      background: "var(--color-kds-bg)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Column header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: `2px solid ${accent}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: ".01em", textTransform: "uppercase", color: "var(--color-kds-ink)" }}>
            {title}
          </h3>
        </div>
        <span style={{ fontSize: 24, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-kds-ink)" }}>{kots.length}</span>
      </div>

      <div className="scroll" style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        {kots.length === 0 && (
          <div style={{ textAlign: "center", padding: 80, color: "var(--color-kds-ink-3)", fontSize: 16 }}>
            All clear
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {kots.map((kot) => {
            const elapsed = Math.floor((now - new Date(kot.createdAt).getTime()) / 60000)
            const overdue = elapsed >= 10
            return (
              <div key={kot.id} style={{
                background: "oklch(20% 0.012 60)",
                border: `1px solid ${overdue ? "oklch(64% 0.21 25)" : "oklch(30% 0.012 60)"}`,
                borderRadius: 12, overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}>
                {/* KOT header */}
                <div style={{
                  padding: "14px 18px",
                  background: overdue ? "oklch(28% 0.08 25)" : "oklch(24% 0.012 60)",
                  borderBottom: "1px solid oklch(30% 0.012 60)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: ".02em", color: "var(--color-kds-ink)" }}>
                      KOT #{kot.kotNumber}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: overdue ? "oklch(72% 0.18 25)" : "var(--color-kds-ink)",
                    }}>{elapsed}m</div>
                    <div style={{ fontSize: 10, color: overdue ? "oklch(72% 0.18 25)" : "var(--color-kds-ink-3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
                      {overdue ? "⚠ Overdue" : "elapsed"}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: 18, flex: 1 }}>
                  {kot.items.map((item, i) => (
                    <div key={item.id} style={{
                      padding: "7px 0", fontSize: 18, fontWeight: 500,
                      borderBottom: i < kot.items.length - 1 ? "1px solid oklch(24% 0.012 60)" : "none",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ color: "var(--color-kds-ink)" }}>
                          {item.name}
                          {item.variantName && (
                            <span style={{ fontSize: 13, color: "var(--color-kds-ink-2)", marginLeft: 6 }}>({item.variantName})</span>
                          )}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", color: accent, fontSize: 20, fontWeight: 700, marginLeft: 12 }}>
                          ×{item.quantity}
                        </span>
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div style={{ marginTop: 4, paddingLeft: 12 }}>
                          {item.modifiers.map((m, mi) => (
                            <div key={mi} style={{ fontSize: 13, color: "var(--color-kds-ink-2)", lineHeight: 1.5 }}>+ {m.name}</div>
                          ))}
                        </div>
                      )}
                      {item.notes && (
                        <div style={{ marginTop: 4, paddingLeft: 12, fontSize: 13, color: "oklch(70% 0.15 70)", fontStyle: "italic" }}>
                          Note: {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Action button */}
                <button onClick={() => onAction(kot.id)} style={{
                  height: 64, background: accent,
                  border: "none",
                  color: stage === "new" ? "oklch(20% 0.04 25)" : "oklch(20% 0.04 70)",
                  fontSize: 17, fontWeight: 700, fontFamily: "inherit",
                  cursor: "pointer", letterSpacing: ".02em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  {stage === "new"
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4l14 8-14 8z"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  }
                  {actionLabel}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function KdsPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [now, setNow] = useState(Date.now())

  // Tick every 30s so elapsed time stays fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const { data: kots = [] } = useQuery({
    queryKey: ["kots"],
    queryFn: () => api.kots.getActive() as Promise<Kot[]>,
    refetchInterval: 15_000,
  })

  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: ["kots"] })
    const u1 = ws.on("kot.new",          invalidate)
    const u2 = ws.on("kot.done",         invalidate)
    const u3 = ws.on("kot.acknowledged", invalidate)
    return () => { u1(); u2(); u3() }
  }, [qc])

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.kots.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kots"] }),
  })

  const doneMutation = useMutation({
    mutationFn: (id: string) => api.kots.done(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kots"] }),
  })

  const newKots  = kots.filter((k) => k.status === "pending")
  const progKots = kots.filter((k) => k.status === "acknowledged")

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-kds-bg)", color: "var(--color-kds-ink)" }}>
      {/* KDS header — high-contrast, independent of TopBar */}
      <div style={{
        height: 64, flexShrink: 0,
        background: "var(--color-kds-bar)",
        borderBottom: "1px solid var(--color-kds-line)",
        display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16,
      }}>
        <button onClick={() => navigate({ to: "/floor" })} style={{
          background: "transparent",
          border: "1px solid oklch(34% 0.012 60)",
          borderRadius: 8, padding: "8px 12px",
          color: "var(--color-kds-ink)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          fontFamily: "inherit",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 8 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-kds-ink)" }}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M7 12h4M7 14h7"/><path d="M9 17v3M15 17v3M6 20h12"/></svg>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.01em" }}>Kitchen Display</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--color-kds-ink-2)" }}>
          <span><b style={{ color: "var(--color-kds-ink)" }}>{newKots.length}</b> new</span>
          <span><b style={{ color: "var(--color-kds-ink)" }}>{progKots.length}</b> in progress</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {new Date(now).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Two-column KOT grid */}
      <div style={{
        flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 1, background: "oklch(28% 0.012 60)",
        overflow: "hidden",
      }}>
        <KDSColumn
          title="New Orders"
          accent="oklch(64% 0.21 25)"
          kots={newKots}
          stage="new"
          actionLabel="Accept"
          onAction={(id) => ackMutation.mutate(id)}
          now={now}
        />
        <KDSColumn
          title="In Progress"
          accent="oklch(76% 0.16 70)"
          kots={progKots}
          stage="progress"
          actionLabel="Done"
          onAction={(id) => doneMutation.mutate(id)}
          now={now}
        />
      </div>
    </div>
  )
}
