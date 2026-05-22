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

function buildPOPrintHtml(po: PO): string {
  const lineTotal = po.items.reduce((s, i) => s + Number(i.orderedQty) * Number(i.unitCost), 0)
  const rows = po.items.map((line) => `
    <tr>
      <td>${line.ingredient.name}</td>
      <td style="text-align:right">${Number(line.orderedQty).toFixed(3)} ${line.ingredient.unit}</td>
      <td style="text-align:right">${Number(line.receivedQty).toFixed(3)} ${line.ingredient.unit}</td>
      <td style="text-align:right">₹${Number(line.unitCost).toFixed(2)}</td>
      <td style="text-align:right">₹${(Number(line.orderedQty) * Number(line.unitCost)).toFixed(2)}</td>
      ${line.note ? `<td>${line.note}</td>` : "<td>—</td>"}
    </tr>`).join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PO-${po.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 32px 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
  .section { margin-bottom: 20px; }
  .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 12px; font-weight: 600; border-bottom: 1px solid #ddd; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tfoot td { font-weight: 700; border-top: 2px solid #ccc; border-bottom: none; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f0f0f0; text-transform: capitalize; }
  .vendor-name { font-weight: 600; font-size: 14px; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; }
  .sig-line { border-top: 1px solid #555; width: 180px; padding-top: 4px; font-size: 11px; color: #888; text-align: center; }
  @media print { body { padding: 10mm 14mm; } @page { size: A4; margin: 10mm; } }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
    <div>
      <h1>Purchase Order</h1>
      <div class="meta">PO-${po.id} · <span class="status">${po.status}</span></div>
    </div>
    <div style="text-align:right;font-size:12px;color:#555;">
      <div>Created: ${fmtDate(po.createdAt)}</div>
      ${po.expectedAt ? `<div>Expected: ${fmtDate(po.expectedAt)}</div>` : ""}
      ${po.receivedAt ? `<div>Received: ${fmtDate(po.receivedAt)}</div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="label">Vendor</div>
    <div class="vendor-name">${po.vendor.name}</div>
    ${po.vendor.phone ? `<div>${po.vendor.phone}</div>` : ""}
    ${po.vendor.email ? `<div>${po.vendor.email}</div>` : ""}
    ${po.vendor.gstin ? `<div>GSTIN: ${po.vendor.gstin}</div>` : ""}
    ${po.vendor.address ? `<div style="color:#555">${po.vendor.address}</div>` : ""}
  </div>

  <div class="section">
    <div class="label">Line Items</div>
    <table>
      <thead><tr>
        <th>Ingredient</th>
        <th style="text-align:right">Ordered</th>
        <th style="text-align:right">Received</th>
        <th style="text-align:right">Unit Cost</th>
        <th style="text-align:right">Line Total</th>
        <th>Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:right">Total</td>
        <td style="text-align:right">₹${lineTotal.toFixed(2)}</td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>

  ${po.notes ? `<div class="section"><div class="label">Notes</div><div>${po.notes}</div></div>` : ""}

  <div class="footer">
    <div class="sig-line">Prepared by</div>
    <div class="sig-line">Authorised Signatory</div>
  </div>
</body></html>`
}

function StatusStepper({ status, po }: { status: POStatus; po: PO }) {
  const currentIdx = STATUS_STEPS.indexOf(status)
  const stepDates: Record<POStatus, string | null> = {
    draft: po.createdAt,
    ordered: po.createdAt,
    partial: null,
    received: po.receivedAt,
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, width: "100%" }}>
      {STATUS_STEPS.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const label = s === "partial" ? "Partial" : s.charAt(0).toUpperCase() + s.slice(1)
        const dateStr = stepDates[s]
        return (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", flex: i < STATUS_STEPS.length - 1 ? "1 1 0" : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {/* Circle */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: done || active ? "var(--color-ink)" : "transparent",
                border: done || active ? "none" : "1.5px dashed var(--color-ink-4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: done || active ? "#fff" : "var(--color-ink-4)",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                boxShadow: active ? "0 0 0 5px var(--color-accent-soft)" : "none",
              }}>
                {done ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                ) : (i + 1)}
              </div>
              {/* Label */}
              <span style={{
                fontSize: 12, fontWeight: done || active ? 600 : 400,
                color: done || active ? "var(--color-ink)" : "var(--color-ink-3)",
                whiteSpace: "nowrap",
              }}>{label}</span>
              {/* Date */}
              <span style={{
                fontSize: 11, fontFamily: "var(--font-mono)",
                color: "var(--color-ink-3)", whiteSpace: "nowrap",
              }}>
                {done || active ? (dateStr ? fmtDate(dateStr) : "—") : (s === "received" ? `Exp. ${fmtDate(po.expectedAt)}` : "—")}
              </span>
            </div>
            {/* Connector */}
            {i < STATUS_STEPS.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                background: done ? "var(--color-ink)" : "var(--color-surface-2)",
                marginTop: 13,
                marginLeft: 6,
                marginRight: 6,
              }} />
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
    const receivedItems = po.items.map((line) => {
      const remaining = Number(line.orderedQty) - Number(line.receivedQty)
      return {
        itemId: line.id,
        receivedQty: Number(receiveQtys[line.id] ?? remaining),
      }
    })
    receiveMutation.mutate(receivedItems)
  }

  function handlePrint() {
    if (!po) return
    const html = buildPOPrintHtml(po)
    const w = window.open("", "_blank", "width=900,height=700")
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
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

  // Vendor initials
  const vendorInitials = po.vendor.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()

  // Status badge class
  const statusBadgeClass =
    po.status === "received" ? "badge green"
    : po.status === "partial" ? "badge blue"
    : po.status === "ordered" ? "badge amber"
    : "badge"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }}>
      <TopBar current="inventory" />

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 20 }}>
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                className="btn ghost"
                style={{ gap: 4, fontSize: 12, alignSelf: "flex-start" }}
                onClick={() => navigate({ to: "/inventory" })}
              >
                ← Back to purchase orders
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                  PO-{id}
                </h1>
                <span className={statusBadgeClass} style={{ textTransform: "capitalize" }}>{po.status}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>
                {po.vendor.name} · ordered {fmtDate(po.createdAt)}{po.expectedAt ? ` · expected ${fmtDate(po.expectedAt)}` : ""}
              </div>
            </div>

            {/* Right — action buttons */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button className="btn" onClick={handlePrint}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print
              </button>
              <button className="btn" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              {po.status === "draft" && (
                <button
                  className="btn"
                  style={{ background: "var(--color-amber)", color: "#fff", border: "none" }}
                  onClick={() => markOrderedMutation.mutate()}
                  disabled={markOrderedMutation.isPending}
                >
                  {markOrderedMutation.isPending ? "Updating…" : "Mark as Ordered"}
                </button>
              )}
              {isReceivable && (
                <button
                  className="btn green"
                  onClick={handleReceive}
                  disabled={receiveMutation.isPending}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  {receiveMutation.isPending ? "Saving…" : "Mark received"}
                </button>
              )}
            </div>
          </div>

          {/* ── Status stepper ── */}
          <div style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            borderRadius: 12,
            padding: "18px 24px",
            marginBottom: 20,
          }}>
            <StatusStepper status={po.status} po={po} />
          </div>

          {/* ── Main grid ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

            {/* Left — Line items card */}
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
              {/* Card header */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Line items</span>
                <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{po.items.length} items</span>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)" }}>Ingredient</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Ordered</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>
                      {isReceivable ? "Qty to receive now" : "Total received"}
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Unit cost</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Line total</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((line, i) => {
                    const alreadyReceived = Number(line.receivedQty)
                    const remaining = Number(line.orderedQty) - alreadyReceived
                    const receivingQty = receiveQtys[line.id] ?? String(remaining)
                    const lineAmt = Number(line.orderedQty) * Number(line.unitCost)
                    const fullyReceived = alreadyReceived >= Number(line.orderedQty)
                    return (
                      <tr key={line.id} style={{ borderBottom: i < po.items.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ fontWeight: 500 }}>{line.ingredient.name}</div>
                          <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>
                            Stock: {Number(line.ingredient.currentStock).toFixed(2)} {line.ingredient.unit}
                          </div>
                          {alreadyReceived > 0 && (
                            <div style={{ fontSize: 11, color: "var(--color-blue)", marginTop: 2 }}>
                              Already received: {alreadyReceived.toFixed(3)} {line.ingredient.unit}
                            </div>
                          )}
                          {line.note && <div style={{ fontSize: 11, color: "var(--color-ink-3)", fontStyle: "italic", marginTop: 2 }}>{line.note}</div>}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {Number(line.orderedQty).toFixed(3)} {line.ingredient.unit}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right" }}>
                          {isReceivable ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                              <input
                                type="number"
                                min="0"
                                max={remaining}
                                step="0.001"
                                value={receivingQty}
                                onChange={(e) => setReceiveQtys((p) => ({ ...p, [line.id]: e.target.value }))}
                                style={{ width: 90, height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: fullyReceived ? "var(--color-surface-2)" : "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }}
                                disabled={fullyReceived}
                              />
                              <span style={{ fontSize: 10, color: "var(--color-ink-3)" }}>
                                {fullyReceived ? "fully received" : `of ${remaining.toFixed(3)} remaining`}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", color: fullyReceived ? "var(--color-green)" : "var(--color-ink-3)" }}>
                              {alreadyReceived.toFixed(3)} {line.ingredient.unit}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>
                          {fmt(line.unitCost)}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                          {fmt(lineAmt)}
                        </td>
                        <td style={{ padding: "13px 16px", textAlign: "right" }}>
                          {fullyReceived ? (
                            <span className="badge green">Received</span>
                          ) : (
                            <span className="badge amber">Pending</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid var(--color-line)" }}>
                    <td colSpan={4} style={{ padding: "11px 16px", textAlign: "right", color: "var(--color-ink-3)", fontSize: 12 }}>Subtotal</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-2)" }}>{fmt(lineTotal)}</td>
                    <td />
                  </tr>
                  <tr style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-line)" }}>
                    <td colSpan={4} style={{ padding: "13px 16px", textAlign: "right", fontWeight: 600, fontSize: 14 }}>Total</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }}>{fmt(lineTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Right sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Vendor card */}
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Vendor</div>

                {/* Avatar + name row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--color-ink-2)" }}>
                    {vendorInitials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{po.vendor.name}</div>
                    {po.vendor.address && (
                      <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2, lineHeight: 1.4 }}>{po.vendor.address}</div>
                    )}
                  </div>
                </div>

                {/* Contact details */}
                {(po.vendor.phone || po.vendor.email || po.vendor.gstin) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, marginTop: 14 }}>
                    {po.vendor.phone && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--color-ink-3)" }}><path d="M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015 2h3a2 2 0 012 1.7c.1.8.3 1.5.5 2.2a2 2 0 01-.5 2L8.9 9a16 16 0 006.1 6.1l1.1-1.1a2 2 0 012-.5c.7.2 1.4.4 2.2.5A2 2 0 0122 16.9z"/></svg>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{po.vendor.phone}</span>
                      </div>
                    )}
                    {po.vendor.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--color-ink-3)" }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                        <span>{po.vendor.email}</span>
                      </div>
                    )}
                    {po.vendor.gstin && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--color-ink-3)" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{po.vendor.gstin}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notes card */}
              {po.notes && (
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Notes</div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.6 }}>{po.notes}</p>
                </div>
              )}

              {/* Receiving info callout */}
              {isReceivable && (
                <div style={{ background: "var(--color-accent-soft)", borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent-ink)", marginBottom: 4 }}>Receiving will auto-update stock</div>
                    <div style={{ fontSize: 12, color: "var(--color-accent-ink)", opacity: 0.8, lineHeight: 1.5 }}>
                      Quantities you enter here will be added directly to ingredient stock levels.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
