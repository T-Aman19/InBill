import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"
import { useAuthStore } from "@/stores/auth"

type KotModifier = { name: string; price: string }
type KotItem = { id: string; name: string; variantName?: string | null; quantity: number; notes?: string | null; modifiers: KotModifier[] }
type Kot     = { id: string; kotNumber: number; status: string; createdAt: string; orderSource?: string; tableName?: string; items: KotItem[] }

type Station = "all" | "tandoor" | "curries" | "cold" | "starters"
const STATIONS: { id: Station; label: string }[] = [
  { id: "all", label: "All" },
  { id: "starters", label: "Starters" },
  { id: "tandoor", label: "Tandoor" },
  { id: "curries", label: "Curries" },
  { id: "cold", label: "Cold" },
]

/** Very rough guess at station from item name — in a real app this comes from the menu item's station field */
function guessStation(name: string): Station {
  const n = name.toLowerCase()
  if (/lassi|ice\s*cream|cold|juice|mocktail|shake/.test(n)) return "cold"
  if (/biryani|naan|roti|paratha|tandoor|tikka|kebab|kulcha/.test(n)) return "tandoor"
  if (/paneer|curry|dal|makhani|butter\s*chicken|gravy|korma|masala|soup/.test(n)) return "curries"
  if (/starter|chaat|bhel|pani\s*puri|samosa|pakora|chilli|gobi|tikki/.test(n)) return "starters"
  return "tandoor"
}

function SourceChip({ src }: { src?: string }) {
  if (!src || src === "pos") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "oklch(26% 0.01 60)", color: "oklch(78% 0.01 70)", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>POS</span>
  )
  if (src === "qr") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "oklch(58% 0.13 245)", color: "white", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>QR</span>
  )
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "oklch(26% 0.01 60)", color: "oklch(78% 0.01 70)", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{src.toUpperCase()}</span>
  )
}

function KotCard({
  kot, stage, elapsed, onAction, isPending,
}: {
  kot: Kot; stage: "new" | "progress"; elapsed: number; onAction: () => void; isPending: boolean
}) {
  const overdue  = elapsed >= 12
  const veryLate = elapsed >= 20

  return (
    <div style={{
      background: "oklch(20% 0.012 60)",
      border: `1.5px solid ${veryLate ? "oklch(58% 0.2 28)" : overdue ? "oklch(74% 0.15 75)" : "oklch(28% 0.012 60)"}`,
      boxShadow: veryLate ? "0 0 0 4px oklch(58% 0.2 28 / .1)" : "none",
      borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 14px",
        background: veryLate ? "oklch(26% 0.1 28)" : overdue ? "oklch(26% 0.08 75)" : "oklch(24% 0.012 60)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "oklch(96% 0.005 70)" }}>
            KOT #{kot.kotNumber}
            {kot.tableName && (
              <span style={{ color: "oklch(72% 0.012 70)", fontWeight: 500, marginLeft: 8, fontSize: 14 }}>{kot.tableName}</span>
            )}
          </div>
          <div style={{ marginTop: 6 }}>
            <SourceChip src={kot.orderSource} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700,
            color: veryLate ? "oklch(78% 0.18 28)" : overdue ? "oklch(80% 0.15 75)" : "oklch(96% 0.005 70)",
          }}>
            {elapsed}m
          </div>
          {veryLate && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "oklch(78% 0.18 28)", textTransform: "uppercase" }}>Overdue</div>}
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: "12px 14px", flex: 1 }}>
        {kot.items.map((item, i) => (
          <div key={item.id} style={{
            padding: "6px 0", fontSize: 16, fontWeight: 500,
            borderBottom: i < kot.items.length - 1 ? "1px solid oklch(26% 0.012 60)" : "none",
            color: "oklch(96% 0.005 70)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ flex: 1, lineHeight: 1.25 }}>
                {item.name}
                {item.variantName && <span style={{ fontSize: 13, color: "oklch(72% 0.012 70)", marginLeft: 6 }}>({item.variantName})</span>}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "oklch(70% 0.17 55)", fontSize: 18, fontWeight: 700 }}>×{item.quantity}</span>
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div style={{ marginTop: 3, paddingLeft: 10 }}>
                {item.modifiers.map((m, mi) => (
                  <div key={mi} style={{ fontSize: 13, color: "oklch(70% 0.012 70)", lineHeight: 1.5 }}>+ {m.name}</div>
                ))}
              </div>
            )}
            {item.notes && (
              <div style={{ marginTop: 3, paddingLeft: 10, fontSize: 13, color: "oklch(72% 0.15 75)", fontStyle: "italic" }}>
                Note: {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action button */}
      <button
        onClick={onAction}
        disabled={isPending}
        style={{
          height: 56, border: "none",
          background: stage === "new" ? "oklch(58% 0.2 28)" : "oklch(46% 0.08 165)",
          color: "white", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
          cursor: isPending ? "not-allowed" : "pointer", letterSpacing: ".02em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          opacity: isPending ? .7 : 1,
        }}
      >
        {stage === "new" ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>
            Accept
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            Done
          </>
        )}
        <span style={{ fontFamily: "var(--font-mono)", opacity: .6, fontSize: 11, marginLeft: 4 }}>
          {stage === "new" ? "↵" : "space"}
        </span>
      </button>
    </div>
  )
}

function KDSColumn({
  title, accent, kots, stage, onAction, now, pendingId,
}: {
  title: string; accent: string; kots: Kot[]
  stage: "new" | "progress"; onAction: (id: string) => void; now: number; pendingId: string | null
}) {
  return (
    <div style={{ background: "oklch(14% 0.01 60)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(96% 0.005 70)" }}>{title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "oklch(96% 0.005 70)" }}>{kots.length}</span>
      </div>
      <div className="scroll" style={{ flex: 1, padding: 14, overflowY: "auto", display: "grid", gap: 12, alignContent: "start" }}>
        {kots.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "oklch(50% 0.012 70)", fontSize: 15 }}>
            All clear
          </div>
        )}
        {kots.map((kot) => {
          const elapsed = Math.floor((now - new Date(kot.createdAt).getTime()) / 60000)
          return (
            <KotCard
              key={kot.id}
              kot={kot}
              stage={stage}
              elapsed={elapsed}
              onAction={() => onAction(kot.id)}
              isPending={pendingId === kot.id}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function KdsPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const logout   = useAuthStore((s) => s.logout)
  const [now, setNow]       = useState(() => Date.now())
  const [station, setStation] = useState<Station>("all")
  const [ackPending, setAckPending]   = useState<string | null>(null)
  const [donePending, setDonePending] = useState<string | null>(null)

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
    onMutate: (id) => setAckPending(id),
    onSettled: () => { setAckPending(null); qc.invalidateQueries({ queryKey: ["kots"] }) },
  })

  const doneMutation = useMutation({
    mutationFn: (id: string) => api.kots.done(id),
    onMutate: (id) => setDonePending(id),
    onSettled: () => { setDonePending(null); qc.invalidateQueries({ queryKey: ["kots"] }) },
  })

  const newKots  = kots.filter((k) => k.status === "pending")
  const progKots = kots.filter((k) => k.status === "acknowledged")

  // Filter by station
  const filterByStation = (list: Kot[]) => {
    if (station === "all") return list
    return list.filter((k) => k.items.some((it) => guessStation(it.name) === station))
  }

  const visibleNew  = filterByStation(newKots)
  const visibleProg = filterByStation(progKots)

  // Overdue tickets (> 20m)
  const overdueKots = kots.filter((k) => {
    const elapsed = Math.floor((now - new Date(k.createdAt).getTime()) / 60000)
    return elapsed >= 20
  })

  const currentTime = new Date(now).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "oklch(14% 0.01 60)", color: "oklch(96% 0.005 70)" }}>

      {/* ── KDS header ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 64, flexShrink: 0,
        background: "oklch(18% 0.01 60)",
        borderBottom: "1px solid oklch(26% 0.012 60)",
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 14,
      }}>
        <button onClick={() => navigate({ to: "/floor" })} style={{
          background: "transparent",
          border: "1px solid oklch(32% 0.012 60)",
          borderRadius: 8, padding: "7px 12px",
          color: "oklch(80% 0.01 70)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "inherit",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Floor
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "oklch(70% 0.17 55)" }}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M7 12h4M7 14h7"/><path d="M9 17v3M15 17v3M6 20h12"/></svg>
          <span className="display" style={{ fontSize: 18, fontWeight: 600 }}>Kitchen</span>
        </div>

        {/* Station selector */}
        <div style={{ marginLeft: 12, display: "flex", gap: 2, padding: 3, background: "oklch(22% 0.012 60)", borderRadius: 8 }}>
          {STATIONS.map((s) => {
            const count = s.id === "all" ? kots.length : kots.filter((k) => k.items.some((it) => guessStation(it.name) === s.id)).length
            return (
              <button key={s.id} onClick={() => setStation(s.id)} style={{
                padding: "6px 12px", borderRadius: 6,
                background: station === s.id ? "oklch(70% 0.17 55)" : "transparent",
                color: station === s.id ? "oklch(34% 0.08 55)" : "oklch(78% 0.012 70)",
                border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
                {s.label} <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", opacity: .7, fontSize: 11 }}>{count}</span>
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Source legend */}
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: "oklch(60% 0.012 70)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "oklch(78% 0.01 70)", display: "inline-block" }} />
            POS {kots.filter((k) => !k.orderSource || k.orderSource === "pos").length}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "oklch(58% 0.13 245)", display: "inline-block" }} />
            QR {kots.filter((k) => k.orderSource === "qr").length}
          </span>
        </div>

        <div style={{ width: 1, height: 22, background: "oklch(26% 0.012 60)" }} />

        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "oklch(78% 0.012 70)" }}>{currentTime}</span>

        <button onClick={() => { logout(); navigate({ to: "/login" }) }} style={{
          background: "transparent",
          border: "1px solid oklch(32% 0.012 60)",
          borderRadius: 8, padding: "7px 12px",
          color: "oklch(60% 0.012 70)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: "inherit",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Switch
        </button>
      </div>

      {/* ── Overdue persistent toast ────────────────────────────────────────── */}
      {overdueKots.length > 0 && (
        <div className="animate-pulse-marigold" style={{
          background: "oklch(58% 0.2 28)", color: "white",
          padding: "10px 20px", fontSize: 13, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 2a8 8 0 100 16A8 8 0 0012 4zm0 3v5l3.5 3.5-1.4 1.4L10 13V7h2z"/></svg>
          <span>
            {overdueKots.length === 1
              ? `KOT #${overdueKots[0]?.kotNumber} · ${Math.floor((now - new Date(overdueKots[0]?.createdAt ?? 0).getTime()) / 60000)}m — captain notified`
              : `${overdueKots.length} tickets overdue — oldest ${Math.floor((now - new Date(overdueKots[0]?.createdAt ?? 0).getTime()) / 60000)}m`
            }
          </span>
          <div style={{ flex: 1 }} />
          <button style={{ background: "rgba(255,255,255,.18)", color: "white", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Bump now
          </button>
        </div>
      )}

      {/* ── Two-column board ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "oklch(26% 0.012 60)", overflow: "hidden" }}>
        <KDSColumn
          title="New"
          accent="oklch(58% 0.2 28)"
          kots={visibleNew}
          stage="new"
          onAction={(id) => ackMutation.mutate(id)}
          now={now}
          pendingId={ackPending}
        />
        <KDSColumn
          title="In Progress"
          accent="oklch(74% 0.15 75)"
          kots={visibleProg}
          stage="progress"
          onAction={(id) => doneMutation.mutate(id)}
          now={now}
          pendingId={donePending}
        />
      </div>
    </div>
  )
}
