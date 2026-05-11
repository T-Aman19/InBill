import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { TopBar } from "@/components/ui/TopBar";
const PAYMENT_MODES = [
    { id: "cash", label: "Cash",
        icon: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "7", width: "20", height: "11", rx: "1.5" }), _jsx("circle", { cx: "12", cy: "12.5", r: "2.5" }), _jsx("path", { d: "M5 10v.01M19 15v.01" })] }) },
    { id: "card", label: "Card",
        icon: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "6", width: "20", height: "13", rx: "2" }), _jsx("path", { d: "M2 11h20M6 16h3" })] }) },
    { id: "upi", label: "UPI",
        icon: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M14 4l-6 16M9 4l-2 8h6l-2 8" }) }) },
];
function Row({ label, value, dim, big }) {
    return (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: big ? "4px 0" : "3px 0", fontSize: big ? 18 : 13, fontWeight: big ? 600 : 400, color: dim ? "var(--color-ink-3)" : "var(--color-ink)" }, children: [_jsx("span", { children: label }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: value })] }));
}
export default function BillingPage() {
    const { billId } = useParams({ from: "/billing/$billId" });
    const navigate = useNavigate();
    const [mode, setMode] = useState("cash");
    const [tendered, setTendered] = useState("");
    const { data: bill, refetch } = useQuery({
        queryKey: ["bill", billId],
        queryFn: () => api.bills.get(billId),
    });
    const { data: outlet } = useQuery({
        queryKey: ["outlet"],
        queryFn: () => api.outlet.get(),
        staleTime: 5 * 60 * 1000,
    });
    const payMutation = useMutation({
        mutationFn: (amount) => api.bills.addPayment(billId, { mode, amount }),
        onSuccess: () => { refetch(); setTendered(""); },
    });
    if (!bill)
        return (_jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }, children: _jsx("div", { style: { color: "var(--color-ink-3)" }, children: "Loading bill\u2026" }) }));
    const paidTotal = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(bill.total) - paidTotal);
    const collectAmt = tendered ? parseFloat(tendered) || 0 : remaining;
    const change = mode === "cash" && tendered && parseFloat(tendered) >= remaining
        ? parseFloat(tendered) - remaining
        : 0;
    function handleCollect() {
        const amount = Math.min(collectAmt, remaining);
        if (amount <= 0)
            return;
        payMutation.mutate(amount);
    }
    // Paid success state
    if (bill.isPaid)
        return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }, children: [_jsxs("div", { className: "print-receipt", style: { display: "none" }, children: [_jsxs("div", { style: { textAlign: "center", paddingBottom: 14, borderBottom: "1px dashed #aaa" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: outlet?.name ?? "InBill" }), outlet?.address && _jsx("div", { style: { fontSize: 11, marginTop: 2 }, children: outlet.address }), outlet?.gstin && _jsxs("div", { style: { fontSize: 11, marginTop: 2 }, children: ["GSTIN ", outlet.gstin] })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 11 }, children: [_jsxs("span", { children: ["Bill #", bill.billNumber] }), _jsx("span", { children: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })] }), bill.items && bill.items.length > 0 && (_jsxs("div", { style: { borderTop: "1px solid #aaa", borderBottom: "1px solid #aaa" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 40px 80px", padding: "8px 0", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }, children: [_jsx("span", { children: "Item" }), _jsx("span", { style: { textAlign: "center" }, children: "Qty" }), _jsx("span", { style: { textAlign: "right" }, children: "Amt" })] }), bill.items.map((l, i) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 40px 80px", padding: "6px 0", fontSize: 12, borderTop: "1px solid #ddd" }, children: [_jsx("span", { children: l.name }), _jsx("span", { style: { textAlign: "center" }, children: l.quantity }), _jsx("span", { style: { textAlign: "right" }, children: formatCurrency(Number(l.unitPrice) * l.quantity) })] }, i)))] })), _jsxs("div", { style: { paddingTop: 12, fontSize: 12 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(bill.subtotal) })] }), Number(bill.discountAmount) > 0 && _jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Discount" }), _jsxs("span", { children: ["-", formatCurrency(bill.discountAmount)] })] }), bill.taxLines.map((line, i) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsxs("span", { children: [line.name, " (", line.rate, "%)"] }), _jsx("span", { children: formatCurrency(line.amount) })] }, i))), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid #aaa", marginTop: 8, paddingTop: 8 }, children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(bill.total) })] })] }), bill.payments.length > 0 && (_jsx("div", { style: { marginTop: 14, paddingTop: 10, borderTop: "1px dashed #aaa", fontSize: 11 }, children: bill.payments.map((p) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { style: { textTransform: "capitalize" }, children: p.mode }), _jsx("span", { children: formatCurrency(p.amount) })] }, p.id))) })), _jsx("div", { style: { textAlign: "center", marginTop: 20, fontSize: 11 }, children: "Thank you for visiting!" })] }), _jsx(TopBar, { current: "floor" }), _jsxs("div", { className: "animate-fade-in", style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }, children: [_jsx("div", { className: "animate-pop", style: {
                                width: 96, height: 96, borderRadius: "50%",
                                background: "var(--color-green-soft)", color: "var(--color-green)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                marginBottom: 24,
                            }, children: _jsx("svg", { width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }), _jsx("div", { style: { fontSize: 26, fontWeight: 600, letterSpacing: "-.01em" }, children: "Payment received" }), _jsxs("div", { style: { fontSize: 16, color: "var(--color-ink-3)", marginTop: 6 }, children: [formatCurrency(bill.total), " collected \u00B7 Bill #", bill.billNumber] }), bill.payments.length > 0 && (_jsx("div", { style: { display: "flex", gap: 18, marginTop: 20, fontSize: 13, color: "var(--color-ink-3)" }, children: bill.payments.map((p) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { textTransform: "capitalize" }, children: p.mode }), _jsx("span", { style: { fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }, children: formatCurrency(p.amount) })] }, p.id))) })), _jsxs("div", { style: { display: "flex", gap: 12, marginTop: 36 }, children: [_jsxs("button", { onClick: () => navigate({ to: "/floor" }), style: {
                                        padding: "16px 28px", borderRadius: 12,
                                        background: "var(--color-ink)", border: "none",
                                        color: "var(--color-bg)", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                                        cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                                    }, children: ["Back to floor", _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })] }), _jsx("button", { onClick: () => window.print(), style: {
                                        padding: "16px 24px", borderRadius: 12,
                                        background: "var(--color-surface)", border: "1px solid var(--color-line-strong)",
                                        color: "var(--color-ink)", fontSize: 15, fontFamily: "inherit", cursor: "pointer",
                                    }, children: "Print receipt" })] })] })] }));
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }, children: [_jsx(TopBar, { current: "floor" }), _jsxs("div", { style: {
                    height: 56, flexShrink: 0,
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-line)",
                    display: "flex", alignItems: "center",
                    padding: "0 20px", gap: 16,
                }, children: [_jsx("button", { onClick: () => navigate({ to: "/floor" }), style: {
                            background: "transparent", border: "none",
                            color: "var(--color-ink-2)", padding: 8, borderRadius: 8, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "transparent", children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }) }), _jsxs("h2", { style: { margin: 0, fontSize: 18, fontWeight: 600 }, children: ["Bill #", bill.billNumber] }), _jsx("div", { style: { flex: 1 } }), _jsx("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) }), _jsx("button", { onClick: () => window.print(), title: "Print receipt", style: {
                            background: "transparent", border: "none",
                            color: "var(--color-ink-3)", padding: 8, borderRadius: 8, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }, onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.color = "var(--color-ink)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-ink-3)"; }, children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "6 9 6 2 18 2 18 9" }), _jsx("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }), _jsx("rect", { x: "6", y: "14", width: "12", height: "8" })] }) })] }), _jsxs("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "1fr 440px", overflow: "hidden" }, children: [_jsx("div", { className: "scroll print-receipt", style: { padding: "24px 32px" }, children: _jsxs("div", { style: { maxWidth: 560, margin: "0 auto" }, children: [_jsxs("div", { style: { textAlign: "center", paddingBottom: 18, borderBottom: "1px dashed var(--color-line-strong)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: outlet?.name ?? "InBill" }), outlet?.address && _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: outlet.address }), outlet?.gstin && _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: ["GSTIN ", outlet.gstin] })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: "14px 0", fontSize: 12, color: "var(--color-ink-3)" }, children: [_jsxs("span", { children: ["Bill #", bill.billNumber] }), _jsx("span", { children: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })] }), bill.items && bill.items.length > 0 && (_jsxs("div", { style: { borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", padding: "10px 0", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500 }, children: [_jsx("span", {}), _jsx("span", { children: "Item" }), _jsx("span", { style: { textAlign: "center" }, children: "Qty" }), _jsx("span", { style: { textAlign: "right" }, children: "Amount" })] }), bill.items.map((l, i) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", padding: "10px 0", fontSize: 14, alignItems: "center", borderTop: "1px solid var(--color-line)" }, children: [_jsx("span", { className: `veg-dot ${l.isVeg ? "veg" : "nonveg"}`, style: { width: 10, height: 10 } }), _jsx("span", { style: { color: "var(--color-ink)" }, children: l.name }), _jsx("span", { style: { textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }, children: l.quantity }), _jsx("span", { style: { textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }, children: formatCurrency(Number(l.unitPrice) * l.quantity) })] }, i)))] })), _jsxs("div", { style: { paddingTop: 16 }, children: [_jsx(Row, { label: "Subtotal", value: formatCurrency(bill.subtotal) }), Number(bill.discountAmount) > 0 && (_jsx(Row, { label: "Discount", value: "− " + formatCurrency(bill.discountAmount), dim: true })), bill.taxLines.map((line, i) => (_jsx(Row, { label: `${line.name} (${line.rate}%)`, value: formatCurrency(line.amount), dim: true }, i))), _jsx("div", { style: { height: 1, background: "var(--color-line-strong)", margin: "12px 0" } }), _jsx(Row, { label: "Total", value: formatCurrency(bill.total), big: true })] }), bill.payments.length > 0 && (_jsxs("div", { style: { marginTop: 18, padding: 12, background: "var(--color-blue-soft)", borderRadius: 10, fontSize: 13 }, children: [_jsx("div", { style: { fontSize: 11, color: "var(--color-blue)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 6 }, children: "Payments received" }), bill.payments.map((p) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", color: "var(--color-ink-2)", padding: "3px 0" }, children: [_jsx("span", { style: { textTransform: "capitalize" }, children: p.mode }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(p.amount) })] }, p.id))), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(0,0,0,.06)" }, children: [_jsx("span", { children: "Remaining" }), _jsx("span", { style: { fontFamily: "var(--font-mono)", color: remaining > 0 ? "var(--color-red)" : "var(--color-green)" }, children: formatCurrency(remaining) })] })] }))] }) }), _jsxs("div", { style: { background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 500 }, children: "Collect payment" }), _jsxs("div", { style: {
                                    padding: 24, background: "var(--color-ink)", color: "var(--color-bg)",
                                    borderRadius: 16, textAlign: "center",
                                }, children: [_jsx("div", { style: { fontSize: 12, opacity: .7, letterSpacing: ".04em", textTransform: "uppercase" }, children: "Amount due" }), _jsx("div", { style: { fontSize: 44, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 4, letterSpacing: "-.02em" }, children: formatCurrency(remaining) })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }, children: PAYMENT_MODES.map(({ id, label, icon }) => (_jsxs("button", { onClick: () => setMode(id), style: {
                                        padding: "14px 8px", borderRadius: 12,
                                        border: "1.5px solid " + (mode === id ? "var(--color-ink)" : "var(--color-line)"),
                                        background: mode === id ? "var(--color-ink)" : "var(--color-surface)",
                                        color: mode === id ? "var(--color-bg)" : "var(--color-ink)",
                                        cursor: "pointer", display: "flex", flexDirection: "column",
                                        alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
                                        textTransform: "capitalize", transition: "all .1s",
                                        fontFamily: "inherit",
                                    }, children: [icon, label] }, id))) }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginBottom: 6 }, children: mode === "cash" ? "Cash tendered (optional)" : "Custom amount (for split)" }), _jsx("input", { value: tendered, onChange: (e) => setTendered(e.target.value.replace(/[^0-9.]/g, "")), placeholder: "₹" + Math.ceil(remaining), style: {
                                            width: "100%", height: 56, padding: "0 18px",
                                            border: "1px solid var(--color-line-strong)", borderRadius: 12,
                                            background: "var(--color-bg)", color: "var(--color-ink)",
                                            fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500,
                                            outline: "none",
                                        }, onFocus: (e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)"), onBlur: (e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)") }), change > 0.005 && (_jsxs("div", { style: { marginTop: 6, fontSize: 13, color: "var(--color-green)", display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Change due" }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontWeight: 600 }, children: formatCurrency(change) })] }))] }), _jsx("div", { style: { flex: 1 } }), _jsxs("button", { onClick: handleCollect, disabled: remaining <= 0 || payMutation.isPending, style: {
                                    height: 56, borderRadius: 14,
                                    background: "var(--color-green)",
                                    border: "1px solid oklch(58% 0.13 150)",
                                    color: "white",
                                    fontSize: 16, fontWeight: 600, fontFamily: "inherit",
                                    cursor: remaining > 0 ? "pointer" : "not-allowed",
                                    opacity: remaining > 0 ? 1 : .4,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                }, children: [payMutation.isPending ? "Processing…" : `Collect ${formatCurrency(Math.min(collectAmt, remaining))}`, !payMutation.isPending && (_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) }))] })] })] })] }));
}
