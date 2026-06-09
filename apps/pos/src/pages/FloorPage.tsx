import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { LogoMark } from "@/components/ui/LogoMark"

type TableStatus = "available" | "occupied" | "reserved" | "billed"
type Table = { id: string; name: string; capacity: number; status: TableStatus; currentOrderId: string | null; floorId: string; source?: string; openedAt?: string; total?: number; items?: number }
type Floor = { id: string; name: string; sortOrder: number }
type CounterItem = { id: string; name: string; quantity: number }
type CounterOrder = { id: string; type: "takeaway" | "delivery"; status: string; createdAt: string; items: CounterItem[]; bill: { isPaid: boolean; total: string; id: string } | null }
type QueueEntry = { id: string; customerName: string; customerPhone: string | null; partySize: number; token: string; status: string; tableId: string | null; joinedAt: string; seatedAt: string | null; cancelledAt: string | null }

function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function waitMinutes(joinedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60000))
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase()
}

const TONE: Record<TableStatus, string>  = { available: "green", occupied: "amber", billed: "red", reserved: "blue" }
const LABEL: Record<TableStatus, string> = { available: "Free", occupied: "Open", billed: "Bill ready", reserved: "Reserved" }

function TableCard({ table, onClick }: { table: Table; onClick: () => void }) {
  const tone     = TONE[table.status]
  const isBilled = table.status === "billed"
  const isOpen   = table.status === "occupied"
  const isFree   = table.status === "available"
  const isRes    = table.status === "reserved"

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: 16,
        padding: 0,
        cursor: "pointer",
        position: "relative",
        boxShadow: isBilled ? "var(--shadow-2)" : "var(--shadow-1)",
        overflow: "hidden",
        minHeight: 120,
        display: "flex", flexDirection: "column",
        transition: "transform .1s, box-shadow .15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = isBilled ? "var(--shadow-2)" : "var(--shadow-1)"; }}
    >
      {/* status stripe */}
      <div style={{ height: 3, background: `var(--color-${tone})`, flexShrink: 0 }} />

      {isBilled && (
        <div className="animate-pulse-red" style={{
          position: "absolute", top: 14, right: 14,
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--color-red)",
        }} />
      )}

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="display" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{table.name}</div>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><path d="M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7"/></svg>
              {table.capacity} seats
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span className={`badge ${tone}`}>
              <span className={`dot ${tone}`} /> {LABEL[table.status]}
            </span>
            {table.source === "qr" && (isOpen || isBilled) && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-blue)", background: "var(--color-blue-soft)", padding: "2px 6px", borderRadius: 5 }}>QR</span>
            )}
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          {isFree && <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>Tap to seat guests</div>}
          {isRes  && <div style={{ fontSize: 12, color: "var(--color-blue)" }}>Reserved</div>}
          {(isOpen || isBilled) && table.openedAt && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>
                {elapsed(table.openedAt)} · {table.items ?? 0} items
              </div>
              {table.total != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>
                  {formatCurrency(table.total)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function QueuePanel({ tables }: { tables: Table[] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [seatEntry, setSeatEntry] = useState<QueueEntry | null>(null)
  const [form, setForm] = useState({ customerName: "", customerPhone: "", partySize: 2 })
  const [formError, setFormError] = useState("")
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const { data: entries = [] } = useQuery<QueueEntry[]>({
    queryKey: ["queue"],
    queryFn: () => api.queue.list("waiting") as Promise<QueueEntry[]>,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    return ws.on("queue.updated", (e: { type: string; payload: unknown }) => {
      qc.setQueryData(["queue"], (e.payload as { entries: QueueEntry[] }).entries.filter((x: QueueEntry) => x.status === "waiting"))
    })
  }, [qc])

  const addMutation = useMutation({
    mutationFn: () => api.queue.addWalkIn({ customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() || null, partySize: form.partySize }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue"] }); setShowModal(false); setForm({ customerName: "", customerPhone: "", partySize: 2 }); setFormError("") },
    onError: (e: Error) => setFormError(e.message ?? "Failed to add"),
  })

  const seatMutation = useMutation({
    mutationFn: ({ entryId, tableId }: { entryId: string; tableId: string }) =>
      api.queue.seat(entryId, tableId) as Promise<{ customerId?: string | null }>,
    onSuccess: (data, { tableId }) => {
      qc.invalidateQueries({ queryKey: ["queue"] })
      qc.invalidateQueries({ queryKey: ["tables"] })
      setSeatEntry(null)
      navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId, customerId: data.customerId ?? undefined } })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "cancelled" | "no_show" }) => api.queue.cancel(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  })

  const freeTables = tables.filter((t) => t.status === "available")

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? 300 : 0, top: "50%", transform: "translateY(-50%)",
          zIndex: 30, background: "var(--color-surface)", border: "1px solid var(--color-line)",
          borderRight: open ? "none" : undefined,
          borderRadius: "8px 0 0 8px",
          padding: "14px 6px", cursor: "pointer", transition: "right .2s",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          boxShadow: "var(--shadow-1)",
        }}
        title={open ? "Close queue" : "Open queue"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {entries.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "var(--color-amber)", color: "#000", borderRadius: 10, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>
            {entries.length}
          </span>
        )}
      </button>

      {/* Slide-in panel */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 300,
        background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)",
        zIndex: 29, display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform .2s", boxShadow: open ? "-4px 0 16px rgba(0,0,0,.12)" : "none",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Queue</div>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>
              {entries.length === 0 ? "No one waiting" : `${entries.length} waiting`}
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Add
          </button>
        </div>

        <div className="scroll" style={{ flex: 1, padding: 10 }}>
          {entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--color-ink-3)", fontSize: 13 }}>No walk-ins waiting</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} style={{ background: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "rgba(251,191,36,.15)", color: "var(--color-amber)", border: "1px solid rgba(251,191,36,.3)", borderRadius: 5, padding: "1px 6px" }}>{entry.token}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.customerName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)", display: "flex", gap: 8 }}>
                      <span>{entry.partySize} {entry.partySize === 1 ? "guest" : "guests"}</span>
                      <span>{waitMinutes(entry.joinedAt)}m wait</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => setSeatEntry(entry)}
                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, background: "var(--color-green)", color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      Seat
                    </button>
                    <div style={{ position: "relative" }}>
                      <KebabMenu onCancel={(status) => cancelMutation.mutate({ id: entry.id, status })} />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add walk-in modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, padding: 24, width: 360, boxShadow: "var(--shadow-3)" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Add Walk-in</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 5 }}>Customer name *</label>
                <input
                  autoFocus
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="e.g. Rahul"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, boxSizing: "border-box" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && form.customerName.trim()) addMutation.mutate() }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 5 }}>Phone (optional)</label>
                <input
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 8 }}>Party size</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setForm((f) => ({ ...f, partySize: Math.max(1, f.partySize - 1) }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }}>−</button>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, minWidth: 28, textAlign: "center" }}>{form.partySize}</span>
                  <button onClick={() => setForm((f) => ({ ...f, partySize: Math.min(50, f.partySize + 1) }))} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }}>+</button>
                </div>
              </div>
              {formError && <div style={{ fontSize: 12, color: "var(--color-red)" }}>{formError}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-ink)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={() => { if (!form.customerName.trim()) { setFormError("Name is required"); return } addMutation.mutate() }}
                disabled={addMutation.isPending}
                style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: addMutation.isPending ? 0.6 : 1 }}
              >
                {addMutation.isPending ? "Adding…" : "Add to queue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat modal */}
      {seatEntry && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setSeatEntry(null) }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, padding: 24, width: 380, boxShadow: "var(--shadow-3)" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Seat {seatEntry.customerName}</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16 }}>{seatEntry.partySize} {seatEntry.partySize === 1 ? "guest" : "guests"} · token {seatEntry.token}</div>
            {freeTables.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-ink-3)", fontSize: 13 }}>No free tables available</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                {freeTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => seatMutation.mutate({ entryId: seatEntry.id, tableId: t.id })}
                    disabled={seatMutation.isPending}
                    style={{ padding: "12px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
                    {t.name}
                    <span style={{ fontSize: 10, color: "var(--color-ink-3)" }}>{t.capacity} seats</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setSeatEntry(null)} style={{ width: "100%", marginTop: 16, padding: "10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-ink)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}

function KebabMenu({ onCancel }: { onCancel: (status: "cancelled" | "no_show") => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 32, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, boxShadow: "var(--shadow-2)", zIndex: 10, minWidth: 130, overflow: "hidden" }}>
          <button onClick={() => { onCancel("no_show"); setOpen(false) }} style={{ width: "100%", padding: "9px 14px", textAlign: "left", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-amber)" }}>No-show</button>
          <button onClick={() => { onCancel("cancelled"); setOpen(false) }} style={{ width: "100%", padding: "9px 14px", textAlign: "left", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-red)" }}>Cancel</button>
        </div>
      )}
    </div>
  )
}

export default function FloorPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const { user, outletName, setupCode, logout } = useAuthStore()
  const [creating, setCreating] = useState(false)
  const [copied,   setCopied]   = useState(false)

  const isManagerOrOwner = user?.role === "manager" || user?.role === "owner"

  async function startOrder(type: "takeaway" | "delivery") {
    if (creating) return
    setCreating(true)
    try {
      const order = await api.orders.create({ type }) as { id: string }
      navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined, customerId: undefined } })
    } finally {
      setCreating(false)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.tables.getAll() as Promise<{ floors: Floor[]; tables: Table[] }>,
  })

  const { data: outlet } = useQuery({
    queryKey: ["outlet"],
    queryFn: () => api.outlet.get(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: counterOrders = [] } = useQuery({
    queryKey: ["counter-orders"],
    queryFn: () => api.orders.getCounter() as Promise<CounterOrder[]>,
    refetchInterval: 30_000,
  })

  const { data: lowStockData } = useQuery<{ count: number }>({
    queryKey: ["low-stock-count"],
    queryFn: () => api.inventory.lowStockCount(),
    enabled: isManagerOrOwner,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const invalidateTables  = () => qc.invalidateQueries({ queryKey: ["tables"] })
    const invalidateCounter = () => qc.invalidateQueries({ queryKey: ["counter-orders"] })
    const u1 = ws.on("table.status",  invalidateTables)
    const u2 = ws.on("order.updated", () => { invalidateTables(); invalidateCounter() })
    const u3 = ws.on("order.created", () => { invalidateTables(); invalidateCounter() })
    return () => { u1(); u2(); u3() }
  }, [qc])

  function handleTableClick(table: Table) {
    if (table.status === "available" || table.status === "reserved") {
      // "reserved" = host seated a customer but no order yet — waiter opens it to start the order
      navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id, customerId: undefined } })
    } else if (table.currentOrderId) {
      navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined, customerId: undefined } })
    }
  }

  const floors = data?.floors ?? []
  const tables = data?.tables ?? []
  const stats  = {
    free:   tables.filter((t) => t.status === "available").length,
    open:   tables.filter((t) => t.status === "occupied").length,
    billed: tables.filter((t) => t.status === "billed").length,
  }
  const lowStockCount    = lowStockData?.count ?? 0
  const displaySetupCode = setupCode ?? null

  function copyCode() {
    if (!displaySetupCode) return
    navigator.clipboard.writeText(displaySetupCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }}>

      {/* ── v2 header ─────────────────────────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-line)",
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 14,
      }}>
        {/* Logo + outlet */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ color: "var(--color-ink)", flexShrink: 0 }}>
            <LogoMark size={28} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", lineHeight: 1.15 }}>{outletName}</div>
            {displaySetupCode ? (
              <button onClick={copyCode} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: ".06em", color: copied ? "var(--v2-marigold-ink)" : "var(--color-ink-4)", fontWeight: 500, transition: "color .15s" }}>
                  {copied ? "Copied!" : displaySetupCode}
                </span>
              </button>
            ) : (
              <div style={{ fontSize: 10, color: "var(--color-ink-4)" }}>Terminal 01</div>
            )}
          </div>
        </div>

        {/* Table stats pill */}
        <div style={{ display: "flex", background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 10, padding: 4, flexShrink: 0 }}>
          {([
            { label: "Free",   dot: "green" as const, val: stats.free   },
            { label: "Open",   dot: "amber" as const, val: stats.open   },
            { label: "Billed", dot: "red"   as const, val: stats.billed },
          ]).map((s, i, arr) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRight: i < arr.length - 1 ? "1px solid var(--color-line)" : "none", fontSize: 12 }}>
              <span className={`dot ${s.dot}`} />
              <span style={{ color: "var(--color-ink-3)" }}>{s.label}</span>
              <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{s.val}</span>
            </div>
          ))}
        </div>

        {/* Quick order actions */}
        <button
          onClick={() => startOrder("takeaway")}
          disabled={creating}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, cursor: creating ? "not-allowed" : "pointer", flexShrink: 0, opacity: creating ? .6 : 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z"/><path d="M8 8V6a4 4 0 018 0v2"/><path d="M9 13h6"/></svg>
          Takeaway
        </button>
        {outlet?.settings?.deliveryEnabled && (
          <button
            onClick={() => startOrder("delivery")}
            disabled={creating}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, cursor: creating ? "not-allowed" : "pointer", flexShrink: 0, opacity: creating ? .6 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14M8 8V6a4 4 0 018 0v2"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M12 12v4M10 14h4"/></svg>
            Delivery
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* App navigation */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {[
            { id: "floor",   label: "Floor",   path: "/floor",   show: user?.role !== "kitchen",
              icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg> },
            { id: "kds",     label: "Kitchen", path: "/kds",     show: user?.role !== "kitchen",
              icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M7 12h4M7 14h7"/><path d="M9 17v3M15 17v3M6 20h12"/></svg> },
            { id: "manager", label: "Manager", path: "/manager", show: isManagerOrOwner,
              icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.8a7 7 0 00-2-1.2L14 3h-4l-.6 2.5a7 7 0 00-2 1.2L5.1 5.9l-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.8a7 7 0 002 1.2L10 21h4l.6-2.5a7 7 0 002-1.2l2.3.8 2-3.4-2-1.5c0-.4.1-.8.1-1.2z"/></svg> },
          ].filter((n) => n.show).map((n) => {
            const active = n.id === "floor"
            return (
              <button key={n.id} onClick={() => navigate({ to: n.path })} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid " + (active ? "var(--color-line)" : "transparent"),
                background: active ? "var(--color-surface-2)" : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-3)",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                position: "relative",
              }}>
                {n.icon}
                {n.label}
                {n.id === "manager" && lowStockCount > 0 && (
                  <span style={{ background: "var(--color-red)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", lineHeight: 1.4 }}>{lowStockCount}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* User chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, borderLeft: "1px solid var(--color-line)", flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
            {initials(user?.name ?? "?")}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink)" }}>{user?.name}</div>
            <div style={{ fontSize: 10, color: "var(--color-ink-3)", textTransform: "capitalize" }}>{user?.role}</div>
          </div>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }) }}
            title="Logout"
            style={{ background: "transparent", border: "none", color: "var(--color-ink-3)", width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg>
          </button>
        </div>
      </div>

      <QueuePanel tables={tables} />

      {/* Counter orders strip */}
      {counterOrders.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--color-line)", background: "var(--color-surface)", padding: "12px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-ink-2)" }}>Counter</span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, background: "rgba(251,146,60,.12)", color: "var(--color-amber)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 20, padding: "1px 7px" }}>{counterOrders.length}</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
            {counterOrders.map((order) => {
              const isPaid            = order.bill?.isPaid ?? false
              const isBuilding        = order.status === "open"
              const isAwaitingPayment = order.status === "billed" && !isPaid
              const statusColor       = isBuilding ? "var(--color-ink-3)" : isAwaitingPayment ? "var(--color-amber)" : "var(--color-blue)"
              const statusLabel       = isBuilding ? "Building" : isAwaitingPayment ? "Awaiting payment" : "In kitchen"
              const itemCount         = order.items.reduce((s, i) => s + i.quantity, 0)
              const elapsedMin        = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000))

              return (
                <button
                  key={order.id}
                  onClick={() => navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined, customerId: undefined } })}
                  style={{ flexShrink: 0, minWidth: 160, maxWidth: 200, padding: "10px 13px", borderRadius: 12, border: `1px solid ${isAwaitingPayment ? "rgba(251,146,60,.4)" : "var(--color-line)"}`, background: isAwaitingPayment ? "rgba(251,146,60,.06)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 5 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-ink-3)" }}>
                      {order.type === "delivery" ? "Delivery" : "Takeaway"}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{elapsedMin}m</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-2)" }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                    {order.bill && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-ink)" }}>
                        ₹{Number(order.bill.total).toFixed(0)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Table grid */}
      <div className="scroll" style={{ flex: 1, padding: "20px 24px" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--color-ink-3)" }}>Loading tables…</div>
        ) : floors.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>No tables yet</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", maxWidth: 280 }}>Set up your floor layout in Manager settings so staff can start taking orders.</div>
            </div>
            <a href="/manager" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Go to Manager settings
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>
        ) : (
          floors.map((floor) => {
            const floorTables = tables.filter((t) => t.floorId === floor.id)
            return (
              <div key={floor.id} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-ink-2)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                    {floor.name}
                  </h3>
                  <div style={{ flex: 1, height: 1, background: "var(--color-line)" }} />
                  <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>
                    {floorTables.filter((t) => t.status === "available").length} / {floorTables.length} free
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
                  {floorTables.map((table) => (
                    <TableCard key={table.id} table={table} onClick={() => handleTableClick(table)} />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}
