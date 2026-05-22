import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"
import { TopBar } from "@/components/ui/TopBar"

type TableStatus = "available" | "occupied" | "reserved" | "billed"
type Table = { id: string; name: string; capacity: number; status: TableStatus; currentOrderId: string | null; floorId: string; source?: string; openedAt?: string; total?: number; items?: number }
type Floor = { id: string; name: string; sortOrder: number }

function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const TONE: Record<TableStatus, string>  = { available: "green", occupied: "amber", billed: "red", reserved: "blue" }
const LABEL: Record<TableStatus, string> = { available: "Free", occupied: "Open", billed: "Bill ready", reserved: "Reserved" }

function TableCard({ table, onClick }: { table: Table; onClick: () => void }) {
  const tone      = TONE[table.status]
  const isBilled  = table.status === "billed"
  const isOpen    = table.status === "occupied"
  const isFree    = table.status === "available"
  const isRes     = table.status === "reserved"

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
      {/* 3px color stripe at top */}
      <div style={{ height: 3, background: `var(--color-${tone})`, flexShrink: 0 }} />

      {/* Pulsing dot for billed */}
      {isBilled && (
        <div className="animate-pulse-red" style={{
          position: "absolute", top: 14, right: 14,
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--color-red)",
        }} />
      )}

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.01em", lineHeight: 1 }}>{table.name}</div>
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
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-blue)", background: "rgba(59,130,246,.1)", padding: "2px 6px", borderRadius: 5 }}>QR</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          {isFree && <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>Tap to seat guests</div>}
          {isRes  && <div style={{ fontSize: 12, color: "var(--color-blue)" }}>{/* reservedFor */}Reserved</div>}
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

export default function FloorPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  async function startOrder(type: "takeaway" | "delivery") {
    if (creating) return
    setCreating(true)
    try {
      const order = await api.orders.create({ type }) as { id: string }
      navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined } })
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

  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: ["tables"] })
    const u1 = ws.on("table.status",  invalidate)
    const u2 = ws.on("order.updated", invalidate)
    const u3 = ws.on("order.created", invalidate)
    return () => { u1(); u2(); u3() }
  }, [qc])

  function handleTableClick(table: Table) {
    if (table.status === "available") {
      // Navigate without creating an order — the order is created lazily when the first item is added
      navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id } })
    } else if (table.currentOrderId) {
      navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined } })
    }
  }

  const floors = data?.floors ?? []
  const tables = data?.tables ?? []
  const stats  = {
    free:   tables.filter((t) => t.status === "available").length,
    open:   tables.filter((t) => t.status === "occupied").length,
    billed: tables.filter((t) => t.status === "billed").length,
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }}>
      <TopBar current="floor" stats={stats} onTakeaway={() => startOrder("takeaway")} onDelivery={outlet?.settings?.deliveryEnabled ? () => startOrder("delivery") : undefined} />

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
