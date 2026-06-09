import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { api, type Table, type Floor, type QueueEntry } from "../lib/api"
import { ws } from "../lib/ws"

// ── Helpers ────────────────────────────────────────────────────

function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function waitMins(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
}

const STATUS_DOT: Record<string, string>    = { available: "green", occupied: "amber", billed: "red", reserved: "blue" }
const STATUS_LABEL: Record<string, string>  = { available: "Free", occupied: "Open", billed: "Bill ready", reserved: "Reserved" }

// ── Bottom sheet ───────────────────────────────────────────────

function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  if (!open) return null
  return (
    <div
      className="animate-fade-in"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50, display: "flex", alignItems: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="animate-slide-up"
        style={{ width: "100%", background: "var(--color-surface)", borderRadius: "20px 20px 0 0", padding: "0 0 env(safe-area-inset-bottom,16px)", maxHeight: "90dvh", display: "flex", flexDirection: "column" }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-line-strong)" }} />
        </div>
        {/* Header */}
        <div style={{ padding: "12px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-line)" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="scroll" style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Table card (compact, two-col) ──────────────────────────────

function TableCard({ table, onTap }: { table: Table; onTap: () => void }) {
  const dot    = STATUS_DOT[table.status]
  const label  = STATUS_LABEL[table.status]
  const isOpen = table.status === "occupied" || table.status === "billed"

  return (
    <button
      onClick={onTap}
      style={{
        textAlign: "left", background: "var(--color-surface)",
        border: "1px solid var(--color-line)", borderRadius: 14, padding: 0,
        cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-1)",
        WebkitTapHighlightColor: "transparent",
      }}
      onPointerDown={(e) => (e.currentTarget.style.opacity = ".7")}
      onPointerUp={(e)   => (e.currentTarget.style.opacity = "1")}
      onPointerLeave={(e)=> (e.currentTarget.style.opacity = "1")}
    >
      {/* Status stripe */}
      <div style={{ height: 3, background: `var(--color-${dot})`, flexShrink: 0 }} />

      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em" }}>{table.name}</div>
          <span className={`badge ${dot}`}>
            <span className={`dot ${dot}`} /> {label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><path d="M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7"/></svg>
            {table.capacity}
          </div>
          {isOpen && table.openedAt && (
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: table.status === "billed" ? "var(--color-red)" : "var(--color-ink-3)" }}>
              {elapsed(table.openedAt)}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Queue entry row ─────────────────────────────────────────────

function QueueRow({ entry, onSeat, onCancel }: { entry: QueueEntry; onSeat: () => void; onCancel: (s: "cancelled" | "no_show") => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener("pointerdown", h)
    return () => document.removeEventListener("pointerdown", h)
  }, [menuOpen])

  const wait = waitMins(entry.joinedAt)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", borderBottom: "1px solid var(--color-line)" }}>
      {/* Token */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "var(--color-amber-soft)", color: oklch45, border: "1px solid rgba(251,191,36,.3)", borderRadius: 6, padding: "3px 7px", flexShrink: 0 }}>
        {entry.token}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.customerName}</div>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 1 }}>
          {entry.partySize} {entry.partySize === 1 ? "guest" : "guests"} · {wait}m wait
          {entry.customerPhone && (
            <span style={{ marginLeft: 6 }}>· {entry.customerPhone}</span>
          )}
        </div>
      </div>

      {/* Wait indicator */}
      <WaitPill minutes={wait} />

      {/* Seat */}
      <button
        onClick={onSeat}
        style={{ flexShrink: 0, height: 38, padding: "0 14px", borderRadius: 10, background: "var(--color-green)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
      >
        Seat
      </button>

      {/* Kebab */}
      <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
        {menuOpen && (
          <div className="animate-pop" style={{ position: "absolute", right: 0, top: 40, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 10, boxShadow: "var(--shadow-2)", zIndex: 10, minWidth: 130, overflow: "hidden" }}>
            <button onClick={() => { onCancel("no_show"); setMenuOpen(false) }} style={{ width: "100%", padding: "11px 14px", textAlign: "left", fontSize: 14, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-amber)" }}>No-show</button>
            <button onClick={() => { onCancel("cancelled"); setMenuOpen(false) }} style={{ width: "100%", padding: "11px 14px", textAlign: "left", fontSize: 14, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-red)" }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

const oklch45 = "oklch(45% 0.12 70)"

function WaitPill({ minutes }: { minutes: number }) {
  const color = minutes >= 20 ? "var(--color-red)" : minutes >= 10 ? "var(--color-amber)" : "var(--color-ink-3)"
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>
      {minutes}m
    </div>
  )
}

// ── Add walk-in form ────────────────────────────────────────────

function AddWalkInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: "", phone: "", partySize: 2 })
  const [err, setErr] = useState("")

  const mutation = useMutation({
    mutationFn: () => api.queue.addWalkIn({ customerName: form.name.trim(), customerPhone: form.phone.trim() || null, partySize: form.partySize }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] })
      setForm({ name: "", phone: "", partySize: 2 })
      setErr("")
      onClose()
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Failed"),
  })

  function submit() {
    if (!form.name.trim()) { setErr("Name is required"); return }
    mutation.mutate()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add Walk-in">
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Name *</label>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErr("") }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Customer name"
            style={{ width: "100%", height: 52, padding: "0 14px", borderRadius: 12, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 16, outline: "none" }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Phone (optional)</label>
          <input
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+91 98765 43210"
            style={{ width: "100%", height: 52, padding: "0 14px", borderRadius: 12, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 16, outline: "none" }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 12 }}>Party size</label>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button
              onClick={() => setForm((f) => ({ ...f, partySize: Math.max(1, f.partySize - 1) }))}
              style={{ width: 52, height: 52, borderRadius: 14, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }}
            >−</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, minWidth: 40, textAlign: "center" }}>{form.partySize}</span>
            <button
              onClick={() => setForm((f) => ({ ...f, partySize: Math.min(50, f.partySize + 1) }))}
              style={{ width: 52, height: 52, borderRadius: 14, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }}
            >+</button>
          </div>
        </div>
        {err && <p style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 12 }}>{err}</p>}
        <button
          onClick={submit}
          disabled={mutation.isPending}
          style={{ width: "100%", height: 54, borderRadius: 14, background: "var(--color-ink)", border: "none", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 16, opacity: mutation.isPending ? .6 : 1 }}
        >
          {mutation.isPending ? "Adding…" : "Add to queue"}
        </button>
      </div>
    </Sheet>
  )
}

// ── Seat sheet (table picker) ───────────────────────────────────

function SeatSheet({ entry, tables, open, onClose }: { entry: QueueEntry | null; tables: Table[]; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ tableId }: { tableId: string }) => api.queue.seat(entry!.id, tableId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queue"] })
      qc.invalidateQueries({ queryKey: ["tables"] })
      onClose()
    },
  })

  const freeTables = tables.filter((t) => t.status === "available")

  if (!entry) return null

  return (
    <Sheet open={open} onClose={onClose} title={`Seat ${entry.customerName}`}>
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginBottom: 16 }}>
          {entry.partySize} {entry.partySize === 1 ? "guest" : "guests"} · token {entry.token} · {waitMins(entry.joinedAt)}m wait
        </div>

        {freeTables.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-ink-3)", fontSize: 14 }}>No free tables right now</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, paddingBottom: 20 }}>
            {freeTables.map((t) => {
              const fits = t.capacity >= entry.partySize
              return (
                <button
                  key={t.id}
                  onClick={() => mutation.mutate({ tableId: t.id })}
                  disabled={mutation.isPending}
                  style={{
                    padding: "14px 10px", borderRadius: 14,
                    border: fits ? "2px solid var(--color-green)" : "1px solid var(--color-line)",
                    background: fits ? "var(--color-green-soft)" : "var(--color-bg)",
                    cursor: "pointer", fontSize: 15, fontWeight: 700,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={fits ? "var(--color-green)" : "var(--color-ink-3)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
                  {t.name}
                  <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontWeight: 400 }}>{t.capacity} seats</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ── Table action sheet ──────────────────────────────────────────

function TableSheet({ table, queueEntries, open, onClose, onSeatFromQueue }: {
  table: Table | null
  queueEntries: QueueEntry[]
  open: boolean
  onClose: () => void
  onSeatFromQueue: (entry: QueueEntry) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const qc = useQueryClient()

  const seatDirectMutation = useMutation({
    mutationFn: (entryId: string) => api.queue.seat(entryId, table!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue"] }); qc.invalidateQueries({ queryKey: ["tables"] }); onClose() },
  })

  if (!table) return null

  const isFree = table.status === "available"
  const waiting = queueEntries.filter((e) => e.partySize <= table.capacity)

  return (
    <>
      <Sheet open={open} onClose={onClose} title={`Table ${table.name}`}>
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <span className={`badge ${STATUS_DOT[table.status]}`}>
              <span className={`dot ${STATUS_DOT[table.status]}`} /> {STATUS_LABEL[table.status]}
            </span>
            <span style={{ fontSize: 13, color: "var(--color-ink-3)" }}>{table.capacity} seats</span>
            {(table.status === "occupied" || table.status === "billed") && table.openedAt && (
              <span style={{ fontSize: 13, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{elapsed(table.openedAt)}</span>
            )}
          </div>

          {isFree && (
            <>
              {waiting.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Seat from queue</div>
                  {waiting.slice(0, 5).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { onSeatFromQueue(e); onClose() }}
                      disabled={seatDirectMutation.isPending}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "var(--color-bg)", border: "1px solid var(--color-line)", cursor: "pointer", marginBottom: 8, textAlign: "left" }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "var(--color-amber-soft)", color: oklch45, border: "1px solid rgba(251,191,36,.3)", borderRadius: 6, padding: "2px 6px" }}>{e.token}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{e.customerName}</span>
                      <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{e.partySize} pax · {waitMins(e.joinedAt)}m</span>
                    </button>
                  ))}
                  <div style={{ height: 12 }} />
                </>
              )}

              <button
                onClick={() => { onClose(); setAddOpen(true) }}
                style={{ width: "100%", height: 52, borderRadius: 14, background: "var(--color-ink)", border: "none", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}
              >
                + Walk-in (no queue)
              </button>
            </>
          )}

          {!isFree && (
            <div style={{ padding: "12px 0 20px", fontSize: 13, color: "var(--color-ink-3)" }}>
              {table.status === "reserved" ? "Table is reserved." : "A waiter is managing this table."}
            </div>
          )}
        </div>
      </Sheet>

      <AddWalkInSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  )
}

// ── Stats bar ───────────────────────────────────────────────────

function StatsBar({ tables, queueCount }: { tables: Table[]; queueCount: number }) {
  const free     = tables.filter((t) => t.status === "available").length
  const occupied = tables.filter((t) => t.status === "occupied" || t.status === "billed").length

  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", overflowX: "auto" }}>
      <Stat label="Free"     value={free}     color="var(--color-green)" />
      <Stat label="Occupied" value={occupied} color="var(--color-amber)" />
      <Stat label="Waiting"  value={queueCount} color={queueCount > 0 ? "var(--color-red)" : "var(--color-ink-4)"} />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{label}</span>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────

type Tab = "tables" | "queue"

export default function HostPage({ onLogout }: { onLogout: () => void }) {
  const qc   = useQueryClient()
  const [tab, setTab]         = useState<Tab>("tables")
  const [addOpen, setAddOpen] = useState(false)
  const [seatEntry, setSeatEntry] = useState<QueueEntry | null>(null)
  const [activeTable, setActiveTable] = useState<Table | null>(null)
  const [, setTick] = useState(0)

  // Tick elapsed every 30s
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // WS subscriptions
  useEffect(() => {
    const u1 = ws.on("table.status",  () => qc.invalidateQueries({ queryKey: ["tables"] }))
    const u2 = ws.on("order.updated", () => qc.invalidateQueries({ queryKey: ["tables"] }))
    const u3 = ws.on("order.created", () => qc.invalidateQueries({ queryKey: ["tables"] }))
    const u4 = ws.on("queue.updated", (e) => {
      const payload = e.payload as { entries?: QueueEntry[] }
      if (payload?.entries) {
        qc.setQueryData(["queue"], payload.entries.filter((x) => x.status === "waiting"))
      } else {
        qc.invalidateQueries({ queryKey: ["queue"] })
      }
    })
    return () => { u1(); u2(); u3(); u4() }
  }, [qc])

  const { data: tableData } = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.tables.getAll(),
    staleTime: 15_000,
  })
  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => api.queue.list("waiting"),
    staleTime: 10_000,
  })
  const { data: outlet } = useQuery({
    queryKey: ["outlet"],
    queryFn: () => api.outlet.get(),
    staleTime: 60_000,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "cancelled" | "no_show" }) => api.queue.cancel(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  })

  const floors  = tableData?.floors ?? []
  const tables  = tableData?.tables ?? []

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", flexShrink: 0, paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>Host</div>
            {outlet && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>{outlet.name}</div>}
          </div>
        </div>

        <button
          onClick={onLogout}
          style={{ height: 34, padding: "0 12px", borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", fontSize: 12, color: "var(--color-ink-3)", cursor: "pointer" }}
        >
          Sign out
        </button>
      </div>

      {/* Stats bar */}
      <StatsBar tables={tables} queueCount={queue.length} />

      {/* Content */}
      <div className="scroll" style={{ flex: 1 }}>
        {tab === "tables" ? (
          <TablesView floors={floors} tables={tables} queue={queue} onTableTap={(t) => setActiveTable(t)} />
        ) : (
          <QueueView queue={queue} onSeat={(e) => setSeatEntry(e)} onCancel={(id, s) => cancelMutation.mutate({ id, status: s })} />
        )}
      </div>

      {/* Bottom nav */}
      <div style={{
        display: "flex", flexShrink: 0,
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <TabBtn label="Tables" icon={<TableIcon />} active={tab === "tables"} onClick={() => setTab("tables")} />
        <TabBtn
          label="Queue"
          icon={<QueueIcon />}
          active={tab === "queue"}
          badge={queue.length > 0 ? queue.length : undefined}
          onClick={() => setTab("queue")}
        />
      </div>

      {/* FAB — only on queue tab */}
      {tab === "queue" && (
        <button
          onClick={() => setAddOpen(true)}
          className="animate-pop"
          style={{
            position: "fixed", right: 20,
            bottom: `calc(72px + env(safe-area-inset-bottom, 0px) + 12px)`,
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--color-ink)", border: "none", color: "white",
            fontSize: 28, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,.2)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20,
          }}
          aria-label="Add walk-in"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      )}

      {/* Sheets */}
      <AddWalkInSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <SeatSheet entry={seatEntry} tables={tables} open={!!seatEntry} onClose={() => setSeatEntry(null)} />
      <TableSheet
        table={activeTable}
        queueEntries={queue}
        open={!!activeTable}
        onClose={() => setActiveTable(null)}
        onSeatFromQueue={(e) => { setActiveTable(null); setSeatEntry(e) }}
      />
    </div>
  )
}

// ── Tables tab view ─────────────────────────────────────────────

function TablesView({ floors, tables, queue, onTableTap }: { floors: Floor[]; tables: Table[]; queue: QueueEntry[]; onTableTap: (t: Table) => void }) {
  if (floors.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🪑</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No tables set up</div>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)", textAlign: "center" }}>Ask a manager to set up the floor layout first.</div>
      </div>
    )
  }

  const waiting = queue.length

  return (
    <div style={{ padding: "16px" }}>
      {waiting > 0 && (
        <div style={{ background: "var(--color-amber-soft)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={oklch45} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: oklch45 }}>
            {waiting} {waiting === 1 ? "party" : "parties"} waiting — tap a free table to seat them
          </span>
        </div>
      )}

      {floors.map((floor) => {
        const floorTables = tables.filter((t) => t.floorId === floor.id)
        const freeCount   = floorTables.filter((t) => t.status === "available").length
        return (
          <div key={floor.id} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase" }}>{floor.name}</h3>
              <div style={{ flex: 1, height: 1, background: "var(--color-line)" }} />
              <span style={{ fontSize: 11, color: "var(--color-ink-4)", fontFamily: "var(--font-mono)" }}>{freeCount}/{floorTables.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {floorTables.map((t) => (
                <TableCard key={t.id} table={t} onTap={() => onTableTap(t)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Queue tab view ──────────────────────────────────────────────

function QueueView({ queue, onSeat, onCancel }: { queue: QueueEntry[]; onSeat: (e: QueueEntry) => void; onCancel: (id: string, s: "cancelled" | "no_show") => void }) {
  if (queue.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", gap: 12 }}>
        <div style={{ fontSize: 32 }}>✅</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No one waiting</div>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Tap + to add a walk-in.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: "0 16px 96px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".06em", padding: "14px 0 6px" }}>
        {queue.length} {queue.length === 1 ? "party" : "parties"} waiting
      </div>
      {queue.map((entry) => (
        <QueueRow
          key={entry.id}
          entry={entry}
          onSeat={() => onSeat(entry)}
          onCancel={(s) => onCancel(entry.id, s)}
        />
      ))}
    </div>
  )
}

// ── Tab button ──────────────────────────────────────────────────

function TabBtn({ label, icon, active, badge, onClick }: { label: string; icon: React.ReactNode; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, height: 56, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 3,
        background: "transparent", border: "none", cursor: "pointer",
        color: active ? "var(--color-ink)" : "var(--color-ink-3)",
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        {icon}
        {badge !== undefined && (
          <span style={{
            position: "absolute", top: -5, right: -8,
            fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)",
            background: "var(--color-red)", color: "white",
            borderRadius: 10, padding: "1px 5px", minWidth: 18, textAlign: "center",
          }}>{badge}</span>
        )}
      </div>
      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: ".03em" }}>{label}</span>
      {active && <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: "var(--color-ink)", borderRadius: "0 0 2px 2px" }} />}
    </button>
  )
}

function TableIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/>
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
