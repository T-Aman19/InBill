import { useState } from "react"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { TopBar } from "@/components/ui/TopBar"

// ── Types ─────────────────────────────────────────────────────────────────────
type POStatus = "draft" | "ordered" | "partial" | "received"

type POLineItem = {
  id: string
  ingredientId: string
  orderedQty: string
  receivedQty: string
  unitCost: string
  note: string | null
  ingredient: { id: string; name: string; unit: string; currentStock: string }
}

type PO = {
  id: string
  status: POStatus
  notes: string | null
  totalAmount: string
  expectedAt: string | null
  receivedAt: string | null
  createdAt: string
  vendor: { id: string; name: string; phone?: string | null; email?: string | null; gstin?: string | null; address?: string | null }
  createdBy: { id: string; name: string } | null
  items: POLineItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_STEPS: POStatus[] = ["draft", "ordered", "partial", "received"]
const STATUS_COLOR: Record<POStatus, string> = {
  draft: "var(--color-ink-3)",
  ordered: "#f59e0b",
  partial: "#3b82f6",
  received: "#16a34a",
}
const STATUS_BG: Record<POStatus, string> = {
  draft: "var(--color-surface-2)",
  ordered: "rgba(245,158,11,.12)",
  partial: "rgba(59,130,246,.12)",
  received: "rgba(22,163,74,.12)",
}

function fmt(n: string | number) { return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" }
function fmtDateTime(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function StatusStepper({ status }: { status: POStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(status)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STATUS_STEPS.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const label = s === "partial" ? "Partial" : s.charAt(0).toUpperCase() + s.slice(1)
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#16a34a" : active ? STATUS_COLOR[status] : "var(--color-surface-2)",
                border: `2px solid ${done ? "#16a34a" : active ? STATUS_COLOR[status] : "var(--color-line)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: done || active ? "#fff" : "var(--color-ink-3)",
                fontSize: 12, fontWeight: 700,
              }}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                ) : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? "var(--color-ink)" : "var(--color-ink-3)", whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div style={{ width: 60, height: 2, background: done ? "#16a34a" : "var(--color-line)", margin: "0 6px", marginBottom: 20 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PODetailPage() {
  const { id } = useParams({ from: "/inventory/purchase-orders/$id" })
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: po, isLoading } = useQuery<PO>({
    queryKey: ["po", id],
    queryFn: () => api.purchaseOrders.get(id) as Promise<PO>,
  })

  // Receive quantities — local state per line item
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({})

  const markOrderedMutation = useMutation({
    mutationFn: () => api.purchaseOrders.markOrdered(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["po", id] }),
  })

  const receiveMutation = useMutation({
    mutationFn: (receivedItems: { itemId: string; receivedQty: number }[]) =>
      api.purchaseOrders.receive(id, { receivedItems }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["po", id] })
      qc.invalidateQueries({ queryKey: ["purchase-orders"] })
      qc.invalidateQueries({ queryKey: ["ingredients"] })
      setReceiveQtys({})
    },
  })

  function handleReceive() {
    if (!po) return
    const receivedItems = po.items.map((line) => ({
      itemId: line.id,
      receivedQty: Number(receiveQtys[line.id] ?? line.orderedQty),
    }))
    receiveMutation.mutate(receivedItems)
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <TopBar current="inventory" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}>Loading…</div>
      </div>
    )
  }

  if (!po) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <TopBar current="inventory" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }}>Purchase order not found.</div>
      </div>
    )
  }

  const isReceivable = po.status === "ordered" || po.status === "partial"
  const lineTotal = po.items.reduce((s, i) => s + Number(i.orderedQty) * Number(i.unitCost), 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }}>
      <TopBar current="inventory" />

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button onClick={() => navigate({ to: "/inventory" })} style={{ background: "transparent", border: "1px solid var(--color-line-strong)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "var(--color-ink-3)", display: "flex", alignItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Purchase Order</h1>
                <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Created {fmtDateTime(po.createdAt)}{po.createdBy ? ` by ${po.createdBy.name}` : ""}</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              {po.status === "draft" && (
                <button
                  onClick={() => markOrderedMutation.mutate()}
                  disabled={markOrderedMutation.isPending}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f59e0b", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {markOrderedMutation.isPending ? "Updating…" : "Mark as Ordered"}
                </button>
              )}
              {isReceivable && (
                <button
                  onClick={handleReceive}
                  disabled={receiveMutation.isPending}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {receiveMutation.isPending ? "Saving…" : "Confirm Receipt"}
                </button>
              )}
              {po.status === "received" && (
                <span style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(22,163,74,.12)", color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
                  Received {fmtDate(po.receivedAt)}
                </span>
              )}
            </div>
          </div>

          {/* Status stepper */}
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: "24px 32px", marginBottom: 24, display: "flex", justifyContent: "center" }}>
            <StatusStepper status={po.status} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>
            {/* Line items */}
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-line)", fontWeight: 600, fontSize: 15 }}>Line Items</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)" }}>Ingredient</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Ordered</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>
                      {isReceivable ? "Receiving" : "Received"}
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Unit Cost</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((line, i) => {
                    const receivingQty = receiveQtys[line.id] ?? String(Number(line.orderedQty) - Number(line.receivedQty))
                    const lineAmt = Number(line.orderedQty) * Number(line.unitCost)
                    const fullyReceived = Number(line.receivedQty) >= Number(line.orderedQty)
                    return (
                      <tr key={line.id} style={{ borderBottom: i < po.items.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ fontWeight: 500 }}>{line.ingredient.name}</div>
                          <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Stock: {Number(line.ingredient.currentStock).toFixed(2)} {line.ingredient.unit}</div>
                          {line.note && <div style={{ fontSize: 11, color: "var(--color-ink-3)", fontStyle: "italic" }}>{line.note}</div>}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {Number(line.orderedQty).toFixed(3)} {line.ingredient.unit}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right" }}>
                          {isReceivable ? (
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={receivingQty}
                              onChange={(e) => setReceiveQtys((p) => ({ ...p, [line.id]: e.target.value }))}
                              style={{ width: 90, height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }}
                            />
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", color: fullyReceived ? "#16a34a" : "var(--color-ink-3)" }}>
                              {Number(line.receivedQty).toFixed(3)} {line.ingredient.unit}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>
                          {fmt(line.unitCost)}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                          {fmt(lineAmt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--color-line)", background: "var(--color-surface-2)" }}>
                    <td colSpan={4} style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 14 }}>Total</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }}>{fmt(lineTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Right sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Vendor card */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Vendor</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{po.vendor.name}</div>
                {po.vendor.phone && (
                  <div style={{ fontSize: 13, color: "var(--color-ink-2)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015 2h3a2 2 0 012 1.7c.1.8.3 1.5.5 2.2a2 2 0 01-.5 2L8.9 9a16 16 0 006.1 6.1l1.1-1.1a2 2 0 012-.5c.7.2 1.4.4 2.2.5A2 2 0 0122 16.9z"/></svg>
                    {po.vendor.phone}
                  </div>
                )}
                {po.vendor.email && (
                  <div style={{ fontSize: 13, color: "var(--color-ink-2)", marginBottom: 4 }}>{po.vendor.email}</div>
                )}
                {po.vendor.gstin && (
                  <div style={{ display: "inline-block", marginTop: 6, padding: "3px 10px", background: "var(--color-surface-2)", borderRadius: 20, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-ink-3)" }}>
                    GSTIN: {po.vendor.gstin}
                  </div>
                )}
                {po.vendor.address && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-ink-3)", lineHeight: 1.5 }}>{po.vendor.address}</div>
                )}
              </div>

              {/* PO metadata */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Details</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--color-ink-3)" }}>Status</span>
                    <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: STATUS_BG[po.status], color: STATUS_COLOR[po.status], textTransform: "capitalize" }}>{po.status}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--color-ink-3)" }}>Expected</span>
                    <span style={{ fontWeight: 500 }}>{fmtDate(po.expectedAt)}</span>
                  </div>
                  {po.receivedAt && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-ink-3)" }}>Received</span>
                      <span style={{ fontWeight: 500, color: "#16a34a" }}>{fmtDate(po.receivedAt)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--color-ink-3)" }}>Items</span>
                    <span style={{ fontWeight: 500 }}>{po.items.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--color-ink-3)" }}>Total</span>
                    <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>{fmt(po.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {po.notes && (
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Notes</div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.6 }}>{po.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
