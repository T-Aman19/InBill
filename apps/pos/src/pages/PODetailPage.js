import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TopBar } from "@/components/ui/TopBar";
// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_STEPS = ["draft", "ordered", "partial", "received"];
function fmt(n) { return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
function buildPOPrintHtml(po) {
    const lineTotal = po.items.reduce((s, i) => s + Number(i.orderedQty) * Number(i.unitCost), 0);
    const rows = po.items.map((line) => `
    <tr>
      <td>${line.ingredient.name}</td>
      <td style="text-align:right">${Number(line.orderedQty).toFixed(3)} ${line.ingredient.unit}</td>
      <td style="text-align:right">${Number(line.receivedQty).toFixed(3)} ${line.ingredient.unit}</td>
      <td style="text-align:right">₹${Number(line.unitCost).toFixed(2)}</td>
      <td style="text-align:right">₹${(Number(line.orderedQty) * Number(line.unitCost)).toFixed(2)}</td>
      ${line.note ? `<td>${line.note}</td>` : "<td>—</td>"}
    </tr>`).join("");
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
</body></html>`;
}
function StatusStepper({ status, po }) {
    const currentIdx = STATUS_STEPS.indexOf(status);
    const stepDates = {
        draft: po.createdAt,
        ordered: po.createdAt,
        partial: null,
        received: po.receivedAt,
    };
    return (_jsx("div", { style: { display: "flex", alignItems: "flex-start", gap: 0, width: "100%" }, children: STATUS_STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const label = s === "partial" ? "Partial" : s.charAt(0).toUpperCase() + s.slice(1);
            const dateStr = stepDates[s];
            return (_jsxs("div", { style: { display: "flex", alignItems: "flex-start", flex: i < STATUS_STEPS.length - 1 ? "1 1 0" : "0 0 auto" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [_jsx("div", { style: {
                                    width: 28, height: 28, borderRadius: "50%",
                                    background: done || active ? "var(--color-ink)" : "transparent",
                                    border: done || active ? "none" : "1.5px dashed var(--color-ink-4)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: done || active ? "#fff" : "var(--color-ink-4)",
                                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                                    boxShadow: active ? "0 0 0 5px var(--color-accent-soft)" : "none",
                                }, children: done ? (_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) })) : (i + 1) }), _jsx("span", { style: {
                                    fontSize: 12, fontWeight: done || active ? 600 : 400,
                                    color: done || active ? "var(--color-ink)" : "var(--color-ink-3)",
                                    whiteSpace: "nowrap",
                                }, children: label }), _jsx("span", { style: {
                                    fontSize: 11, fontFamily: "var(--font-mono)",
                                    color: "var(--color-ink-3)", whiteSpace: "nowrap",
                                }, children: done || active ? (dateStr ? fmtDate(dateStr) : "—") : (s === "received" ? `Exp. ${fmtDate(po.expectedAt)}` : "—") })] }), i < STATUS_STEPS.length - 1 && (_jsx("div", { style: {
                            flex: 1,
                            height: 2,
                            background: done ? "var(--color-ink)" : "var(--color-surface-2)",
                            marginTop: 13,
                            marginLeft: 6,
                            marginRight: 6,
                        } }))] }, s));
        }) }));
}
// ── Page ──────────────────────────────────────────────────────────────────────
export default function PODetailPage() {
    const { id } = useParams({ from: "/inventory/purchase-orders/$id" });
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { data: po, isLoading } = useQuery({
        queryKey: ["po", id],
        queryFn: () => api.purchaseOrders.get(id),
    });
    // Receive quantities — local state per line item
    const [receiveQtys, setReceiveQtys] = useState({});
    const markOrderedMutation = useMutation({
        mutationFn: () => api.purchaseOrders.markOrdered(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["po", id] }),
    });
    const receiveMutation = useMutation({
        mutationFn: (receivedItems) => api.purchaseOrders.receive(id, { receivedItems }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["po", id] });
            qc.invalidateQueries({ queryKey: ["purchase-orders"] });
            qc.invalidateQueries({ queryKey: ["ingredients"] });
            setReceiveQtys({});
        },
    });
    function handleReceive() {
        if (!po)
            return;
        const receivedItems = po.items.map((line) => {
            const remaining = Number(line.orderedQty) - Number(line.receivedQty);
            return {
                itemId: line.id,
                receivedQty: Number(receiveQtys[line.id] ?? remaining),
            };
        });
        receiveMutation.mutate(receivedItems);
    }
    function handlePrint() {
        if (!po)
            return;
        const html = buildPOPrintHtml(po);
        const w = window.open("", "_blank", "width=900,height=700");
        if (!w)
            return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    }
    if (isLoading) {
        return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100vh" }, children: [_jsx(TopBar, { current: "inventory" }), _jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }, children: "Loading\u2026" })] }));
    }
    if (!po) {
        return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100vh" }, children: [_jsx(TopBar, { current: "inventory" }), _jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }, children: "Purchase order not found." })] }));
    }
    const isReceivable = po.status === "ordered" || po.status === "partial";
    const lineTotal = po.items.reduce((s, i) => s + Number(i.orderedQty) * Number(i.unitCost), 0);
    // Vendor initials
    const vendorInitials = po.vendor.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    // Status badge class
    const statusBadgeClass = po.status === "received" ? "badge green"
        : po.status === "partial" ? "badge blue"
            : po.status === "ordered" ? "badge amber"
                : "badge";
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }, children: [_jsx(TopBar, { current: "inventory" }), _jsx("div", { style: { flex: 1, overflow: "auto" }, children: _jsxs("div", { style: { maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 20 }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("button", { className: "btn ghost", style: { gap: 4, fontSize: 12, alignSelf: "flex-start" }, onClick: () => navigate({ to: "/inventory" }), children: "\u2190 Back to purchase orders" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 2 }, children: [_jsxs("h1", { style: { margin: 0, fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)", lineHeight: 1 }, children: ["PO-", id] }), _jsx("span", { className: statusBadgeClass, style: { textTransform: "capitalize" }, children: po.status })] }), _jsxs("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: [po.vendor.name, " \u00B7 ordered ", fmtDate(po.createdAt), po.expectedAt ? ` · expected ${fmtDate(po.expectedAt)}` : ""] })] }), _jsxs("div", { style: { display: "flex", gap: 8, flexShrink: 0 }, children: [_jsxs("button", { className: "btn", onClick: handlePrint, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "6 9 6 2 18 2 18 9" }), _jsx("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }), _jsx("rect", { x: "6", y: "14", width: "12", height: "8" })] }), "Print"] }), _jsxs("button", { className: "btn", disabled: true, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }), _jsx("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })] }), "Edit"] }), po.status === "draft" && (_jsx("button", { className: "btn", style: { background: "var(--color-amber)", color: "#fff", border: "none" }, onClick: () => markOrderedMutation.mutate(), disabled: markOrderedMutation.isPending, children: markOrderedMutation.isPending ? "Updating…" : "Mark as Ordered" })), isReceivable && (_jsxs("button", { className: "btn green", onClick: handleReceive, disabled: receiveMutation.isPending, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) }), receiveMutation.isPending ? "Saving…" : "Mark received"] }))] })] }), _jsx("div", { style: {
                                background: "var(--color-surface)",
                                border: "1px solid var(--color-line)",
                                borderRadius: 12,
                                padding: "18px 24px",
                                marginBottom: 20,
                            }, children: _jsx(StatusStepper, { status: po.status, po: po }) }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }, children: [_jsxs("div", { style: { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }, children: [_jsxs("div", { style: { padding: "14px 20px", borderBottom: "1px solid var(--color-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: "Line items" }), _jsxs("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: [po.items.length, " items"] })] }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("th", { style: { padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)" }, children: "Ingredient" }), _jsx("th", { style: { padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }, children: "Ordered" }), _jsx("th", { style: { padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }, children: isReceivable ? "Qty to receive now" : "Total received" }), _jsx("th", { style: { padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }, children: "Unit cost" }), _jsx("th", { style: { padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }, children: "Line total" }), _jsx("th", { style: { padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--color-ink-3)" }, children: "Status" })] }) }), _jsx("tbody", { children: po.items.map((line, i) => {
                                                        const alreadyReceived = Number(line.receivedQty);
                                                        const remaining = Number(line.orderedQty) - alreadyReceived;
                                                        const receivingQty = receiveQtys[line.id] ?? String(remaining);
                                                        const lineAmt = Number(line.orderedQty) * Number(line.unitCost);
                                                        const fullyReceived = alreadyReceived >= Number(line.orderedQty);
                                                        return (_jsxs("tr", { style: { borderBottom: i < po.items.length - 1 ? "1px solid var(--color-line)" : "none" }, children: [_jsxs("td", { style: { padding: "13px 16px" }, children: [_jsx("div", { style: { fontWeight: 500 }, children: line.ingredient.name }), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: ["Stock: ", Number(line.ingredient.currentStock).toFixed(2), " ", line.ingredient.unit] }), alreadyReceived > 0 && (_jsxs("div", { style: { fontSize: 11, color: "var(--color-blue)", marginTop: 2 }, children: ["Already received: ", alreadyReceived.toFixed(3), " ", line.ingredient.unit] })), line.note && _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", fontStyle: "italic", marginTop: 2 }, children: line.note })] }), _jsxs("td", { style: { padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)" }, children: [Number(line.orderedQty).toFixed(3), " ", line.ingredient.unit] }), _jsx("td", { style: { padding: "13px 16px", textAlign: "right" }, children: isReceivable ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }, children: [_jsx("input", { type: "number", min: "0", max: remaining, step: "0.001", value: receivingQty, onChange: (e) => setReceiveQtys((p) => ({ ...p, [line.id]: e.target.value })), style: { width: 90, height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: fullyReceived ? "var(--color-surface-2)" : "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }, disabled: fullyReceived }), _jsx("span", { style: { fontSize: 10, color: "var(--color-ink-3)" }, children: fullyReceived ? "fully received" : `of ${remaining.toFixed(3)} remaining` })] })) : (_jsxs("span", { style: { fontFamily: "var(--font-mono)", color: fullyReceived ? "var(--color-green)" : "var(--color-ink-3)" }, children: [alreadyReceived.toFixed(3), " ", line.ingredient.unit] })) }), _jsx("td", { style: { padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }, children: fmt(line.unitCost) }), _jsx("td", { style: { padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }, children: fmt(lineAmt) }), _jsx("td", { style: { padding: "13px 16px", textAlign: "right" }, children: fullyReceived ? (_jsx("span", { className: "badge green", children: "Received" })) : (_jsx("span", { className: "badge amber", children: "Pending" })) })] }, line.id));
                                                    }) }), _jsxs("tfoot", { children: [_jsxs("tr", { style: { borderTop: "1px solid var(--color-line)" }, children: [_jsx("td", { colSpan: 4, style: { padding: "11px 16px", textAlign: "right", color: "var(--color-ink-3)", fontSize: 12 }, children: "Subtotal" }), _jsx("td", { style: { padding: "11px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-2)" }, children: fmt(lineTotal) }), _jsx("td", {})] }), _jsxs("tr", { style: { background: "var(--color-surface-2)", borderTop: "1px solid var(--color-line)" }, children: [_jsx("td", { colSpan: 4, style: { padding: "13px 16px", textAlign: "right", fontWeight: 600, fontSize: 14 }, children: "Total" }), _jsx("td", { style: { padding: "13px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }, children: fmt(lineTotal) }), _jsx("td", {})] })] })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { style: { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Vendor" }), _jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, marginTop: 10 }, children: [_jsx("div", { style: { width: 36, height: 36, borderRadius: 9, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 600, color: "var(--color-ink-2)" }, children: vendorInitials }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: po.vendor.name }), po.vendor.address && (_jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2, lineHeight: 1.4 }, children: po.vendor.address }))] })] }), (po.vendor.phone || po.vendor.email || po.vendor.gstin) && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, fontSize: 12, marginTop: 14 }, children: [po.vendor.phone && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, color: "var(--color-ink-3)" }, children: _jsx("path", { d: "M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015 2h3a2 2 0 012 1.7c.1.8.3 1.5.5 2.2a2 2 0 01-.5 2L8.9 9a16 16 0 006.1 6.1l1.1-1.1a2 2 0 012-.5c.7.2 1.4.4 2.2.5A2 2 0 0122 16.9z" }) }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 11.5 }, children: po.vendor.phone })] })), po.vendor.email && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, color: "var(--color-ink-3)" }, children: [_jsx("rect", { x: "2", y: "4", width: "20", height: "16", rx: "2" }), _jsx("path", { d: "M2 7l10 7 10-7" })] }), _jsx("span", { children: po.vendor.email })] })), po.vendor.gstin && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7, color: "var(--color-ink-2)" }, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, color: "var(--color-ink-3)" }, children: [_jsx("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }), _jsx("polyline", { points: "14 2 14 8 20 8" })] }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 11 }, children: po.vendor.gstin })] }))] }))] }), po.notes && (_jsxs("div", { style: { background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }, children: "Notes" }), _jsx("p", { style: { margin: 0, fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.6 }, children: po.notes })] })), isReceivable && (_jsxs("div", { style: { background: "var(--color-accent-soft)", borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "flex-start" }, children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-accent)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, marginTop: 1 }, children: _jsx("path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }) }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--color-accent-ink)", marginBottom: 4 }, children: "Receiving will auto-update stock" }), _jsx("div", { style: { fontSize: 12, color: "var(--color-accent-ink)", opacity: 0.8, lineHeight: 1.5 }, children: "Quantities you enter here will be added directly to ingredient stock levels." })] })] }))] })] })] }) })] }));
}
