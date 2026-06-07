import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Floor, Table } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"

const STATUS_COLOR: Record<Table["status"], string> = {
  available: "var(--color-green)",
  occupied:  "var(--color-amber)",
  billed:    "var(--color-red)",
  reserved:  "var(--color-blue)",
}
const STATUS_LABEL: Record<Table["status"], string> = {
  available: "Free",
  occupied:  "Open",
  billed:    "Bill ready",
  reserved:  "Reserved",
}
const STATUS_TONE: Record<Table["status"], string> = {
  available: "green",
  occupied:  "amber",
  billed:    "red",
  reserved:  "blue",
}

function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function TableCard({ table, onClick }: { table: Table; onClick: () => void }) {
  const isBilled = table.status === "billed"
  const isOpen   = table.status === "occupied"
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", width: "100%",
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: 16, padding: 0, cursor: "pointer",
        boxShadow: isBilled ? "var(--shadow-2)" : "var(--shadow-1)",
        overflow: "hidden", minHeight: 100,
        display: "flex", flexDirection: "column",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      {/* status stripe */}
      <div style={{ height: 4, background: STATUS_COLOR[table.status], flexShrink: 0 }} />
      {isBilled && (
        <div className="animate-pulse-red" style={{
          position: "absolute", top: 16, right: 16,
          width: 8, height: 8, borderRadius: "50%",
          background: "var(--color-red)",
        }} />
      )}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{table.name}</span>
          <span className={`badge ${STATUS_TONE[table.status]}`}>
            <span className={`dot ${STATUS_TONE[table.status]}`} />
            {STATUS_LABEL[table.status]}
          </span>
        </div>
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          {table.status === "available" && (
            <div style={{ fontSize: 12, color: "var(--color-ink-4)" }}>Tap to start order</div>
          )}
          {(isOpen || isBilled) && table.openedAt && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>
                {elapsed(table.openedAt)} · {table.items ?? 0} items
              </div>
              {table.total != null && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
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
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const { logout, user, outletName } = useAuthStore()
  const [activeFloor, setActiveFloor] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.tables.getAll(),
  })

  const floors: Floor[]  = data?.floors  ?? []
  const tables: Table[]  = data?.tables  ?? []

  // Set initial active floor
  useEffect(() => {
    if (floors.length && !activeFloor) setActiveFloor(floors[0]?.id ?? null)
  }, [floors, activeFloor])

  // Live updates
  useEffect(() => {
    const unsub = ws.on("*", () => {
      qc.invalidateQueries({ queryKey: ["tables"] })
    })
    return unsub
  }, [qc])

  function handleTableTap(table: Table) {
    if (table.status === "billed") return // captain can't bill
    if (table.currentOrderId) {
      navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined } })
    } else {
      navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id } })
    }
  }

  const floorTables = tables.filter((t) => t.floorId === activeFloor)
  const free    = tables.filter((t) => t.status === "available").length
  const open    = tables.filter((t) => t.status === "occupied").length
  const billed  = tables.filter((t) => t.status === "billed").length

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      background: "var(--color-bg)",
    }}>
      {/* Top bar */}
      <div style={{
        paddingTop: "calc(12px + var(--safe-top))",
        paddingLeft: 16, paddingRight: 16, paddingBottom: 12,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-line)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{outletName ?? "InBill"}</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 1 }}>
              {user?.name} · Captain
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              background: "transparent", border: "none", padding: "8px 12px",
              fontSize: 13, color: "var(--color-ink-3)", cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <span className="badge green"><span className="dot green" />{free} free</span>
          <span className="badge amber"><span className="dot amber" />{open} open</span>
          {billed > 0 && <span className="badge red"><span className="dot red" />{billed} billing</span>}
        </div>
      </div>

      {/* Floor tabs */}
      {floors.length > 1 && (
        <div style={{
          display: "flex", gap: 0, overflowX: "auto",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-line)",
          flexShrink: 0, scrollbarWidth: "none",
        }}>
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFloor(f.id)}
              style={{
                padding: "10px 18px",
                fontSize: 13, fontWeight: activeFloor === f.id ? 600 : 400,
                color: activeFloor === f.id ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${activeFloor === f.id ? "var(--color-accent)" : "transparent"}`,
                whiteSpace: "nowrap",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Table grid */}
      <div className="scroll" style={{ flex: 1, padding: 12, paddingBottom: "calc(12px + var(--safe-bottom))" }}>
        {isLoading && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--color-ink-3)" }}>Loading tables…</div>
        )}
        {!isLoading && floorTables.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--color-ink-3)" }}>No tables on this floor</div>
        )}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}>
          {floorTables.map((t) => (
            <div key={t.id} style={{ position: "relative" }}>
              <TableCard table={t} onClick={() => handleTableTap(t)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
