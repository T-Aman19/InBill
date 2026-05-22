import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { QRCode } from "react-qr-code";
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
    const qc = useQueryClient();
    const [mode, setMode] = useState("cash");
    const [tendered, setTendered] = useState("");
    const [showDiscounts, setShowDiscounts] = useState(false);
    const [discountErr, setDiscountErr] = useState("");
    const [upiPayment, setUpiPayment] = useState(null);
    const [showRedeemModal, setShowRedeemModal] = useState(false);
    const [redeemPoints, setRedeemPoints] = useState("");
    const [redeemErr, setRedeemErr] = useState("");
    const pollRef = useRef(null);
    const [custPhone, setCustPhone] = useState("");
    const [custName, setCustName] = useState("");
    const [custLinking, setCustLinking] = useState(false);
    const [custErr, setCustErr] = useState("");
    async function handleLinkCustomer() {
        if (!custPhone.trim() || !bill)
            return;
        setCustLinking(true);
        setCustErr("");
        try {
            const cust = await api.customers.upsert({ phone: custPhone.trim(), name: custName.trim() || undefined });
            await api.orders.linkCustomer(bill.orderId, cust.id);
            refetchLoyalty();
        }
        catch {
            setCustErr("Could not link customer");
        }
        finally {
            setCustLinking(false);
        }
    }
    const { data: bill, refetch } = useQuery({
        queryKey: ["bill", billId],
        queryFn: () => api.bills.get(billId),
    });
    const { data: discountPresets = [] } = useQuery({
        queryKey: ["discounts"],
        queryFn: () => api.discounts.list(),
    });
    const { data: outlet } = useQuery({
        queryKey: ["outlet"],
        queryFn: () => api.outlet.get(),
        staleTime: 5 * 60 * 1000,
    });
    const { data: loyaltyInfo, refetch: refetchLoyalty } = useQuery({
        queryKey: ["loyalty-bill", billId],
        queryFn: () => api.loyalty.getBillInfo(billId),
        enabled: !!billId,
    });
    const redeemMutation = useMutation({
        mutationFn: (points) => api.loyalty.redeem({ customerId: loyaltyInfo.customer.id, points, billId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["bill", billId] });
            refetchLoyalty();
            setShowRedeemModal(false);
            setRedeemPoints("");
            setRedeemErr("");
        },
        onError: (e) => setRedeemErr(e.message),
    });
    const payMutation = useMutation({
        mutationFn: (amount) => api.bills.addPayment(billId, { mode, amount }),
        onSuccess: () => { refetch(); setTendered(""); qc.invalidateQueries({ queryKey: ["tables"] }); },
    });
    const initiateUpiMutation = useMutation({
        mutationFn: () => api.bills.initiateUpi(billId),
        onSuccess: (res) => {
            setUpiPayment(res);
            pollRef.current = setInterval(async () => {
                try {
                    const s = await api.bills.upiStatus(billId, res.paymentId);
                    if (s.status === "success" || s.isPaid) {
                        clearInterval(pollRef.current);
                        setUpiPayment(null);
                        refetch();
                        qc.invalidateQueries({ queryKey: ["tables"] });
                    }
                }
                catch { /* ignore poll errors */ }
            }, 3000);
        },
    });
    const simulateUpiMutation = useMutation({
        mutationFn: (paymentId) => api.bills.simulateUpi(billId, paymentId),
        onSuccess: () => {
            clearInterval(pollRef.current);
            setUpiPayment(null);
            refetch();
            qc.invalidateQueries({ queryKey: ["tables"] });
        },
    });
    useEffect(() => () => { if (pollRef.current)
        clearInterval(pollRef.current); }, []);
    const applyDiscountMutation = useMutation({
        mutationFn: (body) => api.bills.applyDiscount(billId, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["bill", billId] }); setShowDiscounts(false); setDiscountErr(""); },
        onError: (e) => setDiscountErr(e.message),
    });
    const removeDiscountMutation = useMutation({
        mutationFn: (lineId) => api.bills.removeDiscount(billId, lineId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["bill", billId] }),
    });
    function calcSavings(preset, orderTotal) {
        let amount = preset.type === "percentage"
            ? (orderTotal * Number(preset.value)) / 100
            : Number(preset.value);
        if (preset.maxDiscountAmount)
            amount = Math.min(amount, Number(preset.maxDiscountAmount));
        return parseFloat(Math.min(amount, orderTotal).toFixed(2));
    }
    function applyDiscount(preset) {
        if (!bill)
            return;
        const orderTotal = Number(bill.subtotal) + Number(bill.taxTotal);
        const savings = calcSavings(preset, orderTotal);
        const label = preset.code ? `${preset.name} (${preset.code})` : preset.name;
        applyDiscountMutation.mutate({ discountId: preset.id, label, amount: savings });
    }
    if (!bill)
        return (_jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }, children: _jsx("div", { style: { color: "var(--color-ink-3)" }, children: "Loading bill\u2026" }) }));
    const paidTotal = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(bill.total) - paidTotal);
    const collectAmt = tendered ? parseFloat(tendered) || 0 : remaining;
    const change = mode === "cash" && tendered && parseFloat(tendered) >= remaining
        ? parseFloat(tendered) - remaining
        : 0;
    function handleCollect() {
        if (mode === "upi") {
            initiateUpiMutation.mutate();
            return;
        }
        const amount = Math.min(collectAmt, remaining);
        if (amount <= 0)
            return;
        payMutation.mutate(amount);
    }
    // Paid success state
    if (bill.isPaid)
        return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }, children: [_jsxs("div", { className: "print-receipt", style: { display: "none" }, children: [_jsxs("div", { style: { textAlign: "center", paddingBottom: 14, borderBottom: "1px dashed #aaa" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: outlet?.name ?? "InBill" }), outlet?.address && _jsx("div", { style: { fontSize: 11, marginTop: 2 }, children: outlet.address }), outlet?.gstin && _jsxs("div", { style: { fontSize: 11, marginTop: 2 }, children: ["GSTIN ", outlet.gstin] }), outlet?.fssaiNumber && _jsxs("div", { style: { fontSize: 11, marginTop: 2 }, children: ["FSSAI ", outlet.fssaiNumber] })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 11 }, children: [_jsxs("span", { children: ["Bill #", bill.billNumber] }), _jsx("span", { children: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })] }), bill.items && bill.items.length > 0 && (_jsxs("div", { style: { borderTop: "1px solid #aaa", borderBottom: "1px solid #aaa" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 40px 80px", padding: "8px 0", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }, children: [_jsx("span", { children: "Item" }), _jsx("span", { style: { textAlign: "center" }, children: "Qty" }), _jsx("span", { style: { textAlign: "right" }, children: "Amt" })] }), bill.items.map((l, i) => (_jsxs("div", { style: { borderTop: "1px solid #ddd", padding: "6px 0", fontSize: 12 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 40px 80px" }, children: [_jsx("span", { children: l.name }), _jsx("span", { style: { textAlign: "center" }, children: l.quantity }), _jsx("span", { style: { textAlign: "right" }, children: formatCurrency((Number(l.unitPrice) + (l.modifiers ?? []).reduce((s, m) => s + Number(m.price), 0)) * l.quantity) })] }), (l.modifiers ?? []).map((m, mi) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 80px", paddingLeft: 10, fontSize: 10, color: "#777", marginTop: 2 }, children: [_jsxs("span", { children: ["+ ", m.name] }), _jsx("span", { style: { textAlign: "right" }, children: formatCurrency(Number(m.price) * l.quantity) })] }, mi)))] }, i)))] })), _jsxs("div", { style: { paddingTop: 12, fontSize: 12 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { children: formatCurrency(bill.subtotal) })] }), (bill.discountLines ?? []).length > 0
                                    ? (bill.discountLines ?? []).map((line, i) => _jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: line.label }), _jsxs("span", { children: ["-", formatCurrency(line.amount)] })] }, i))
                                    : Number(bill.discountAmount) > 0 && _jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Discount" }), _jsxs("span", { children: ["-", formatCurrency(bill.discountAmount)] })] }), bill.taxLines.map((line, i) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsxs("span", { children: [line.name, " (", line.rate, "%)"] }), _jsx("span", { children: formatCurrency(line.amount) })] }, i))), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid #aaa", marginTop: 8, paddingTop: 8 }, children: [_jsx("span", { children: "Total" }), _jsx("span", { children: formatCurrency(bill.total) })] })] }), bill.payments.length > 0 && (_jsx("div", { style: { marginTop: 14, paddingTop: 10, borderTop: "1px dashed #aaa", fontSize: 11 }, children: bill.payments.map((p) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { style: { textTransform: "capitalize" }, children: p.mode }), _jsx("span", { children: formatCurrency(p.amount) })] }, p.id))) })), _jsx("div", { style: { textAlign: "center", marginTop: 20, fontSize: 11 }, children: "Thank you for visiting!" })] }), _jsx(TopBar, { current: "floor" }), _jsxs("div", { className: "animate-fade-in", style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }, children: [_jsx("div", { className: "animate-pop", style: {
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
                        }, onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.color = "var(--color-ink)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-ink-3)"; }, children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("polyline", { points: "6 9 6 2 18 2 18 9" }), _jsx("path", { d: "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" }), _jsx("rect", { x: "6", y: "14", width: "12", height: "8" })] }) })] }), _jsxs("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "1fr 440px", overflow: "hidden" }, children: [_jsx("div", { className: "scroll print-receipt", style: { padding: "24px 32px" }, children: _jsxs("div", { style: { maxWidth: 560, margin: "0 auto" }, children: [_jsxs("div", { style: { textAlign: "center", paddingBottom: 18, borderBottom: "1px dashed var(--color-line-strong)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: outlet?.name ?? "InBill" }), outlet?.address && _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: outlet.address }), outlet?.gstin && _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: ["GSTIN ", outlet.gstin] })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: "14px 0", fontSize: 12, color: "var(--color-ink-3)" }, children: [_jsxs("span", { children: ["Bill #", bill.billNumber] }), _jsx("span", { children: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })] }), bill.items && bill.items.length > 0 && (_jsxs("div", { style: { borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", padding: "10px 0", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500 }, children: [_jsx("span", {}), _jsx("span", { children: "Item" }), _jsx("span", { style: { textAlign: "center" }, children: "Qty" }), _jsx("span", { style: { textAlign: "right" }, children: "Amount" })] }), bill.items.map((l, i) => (_jsxs("div", { style: { borderTop: "1px solid var(--color-line)", padding: "10px 0" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", fontSize: 14, alignItems: "center" }, children: [_jsx("span", { className: `veg-dot ${l.isVeg ? "veg" : "nonveg"}`, style: { width: 10, height: 10 } }), _jsx("span", { style: { color: "var(--color-ink)", fontWeight: 500 }, children: l.name }), _jsx("span", { style: { textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }, children: l.quantity }), _jsx("span", { style: { textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }, children: formatCurrency((Number(l.unitPrice) + (l.modifiers ?? []).reduce((s, m) => s + Number(m.price), 0)) * l.quantity) })] }), (l.modifiers ?? []).map((m, mi) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }, children: [_jsx("span", {}), _jsxs("span", { style: { paddingLeft: 4 }, children: ["+ ", m.name] }), _jsx("span", {}), _jsx("span", { style: { textAlign: "right", fontFamily: "var(--font-mono)" }, children: formatCurrency(Number(m.price) * l.quantity) })] }, mi)))] }, i)))] })), _jsxs("div", { style: { paddingTop: 16 }, children: [_jsx(Row, { label: "Subtotal", value: formatCurrency(bill.subtotal) }), (bill.discountLines ?? []).length > 0
                                            ? (bill.discountLines ?? []).map((line, i) => (_jsx(Row, { label: line.label, value: "− " + formatCurrency(line.amount), dim: true }, i)))
                                            : Number(bill.discountAmount) > 0 && (_jsx(Row, { label: "Discount", value: "− " + formatCurrency(bill.discountAmount), dim: true })), bill.taxLines.map((line, i) => (_jsx(Row, { label: `${line.name} (${line.rate}%)`, value: formatCurrency(line.amount), dim: true }, i))), _jsx("div", { style: { height: 1, background: "var(--color-line-strong)", margin: "12px 0" } }), _jsx(Row, { label: "Total", value: formatCurrency(bill.total), big: true })] }), bill.payments.length > 0 && (_jsxs("div", { style: { marginTop: 18, padding: 12, background: "var(--color-blue-soft)", borderRadius: 10, fontSize: 13 }, children: [_jsx("div", { style: { fontSize: 11, color: "var(--color-blue)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 6 }, children: "Payments received" }), bill.payments.map((p) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", color: "var(--color-ink-2)", padding: "3px 0" }, children: [_jsx("span", { style: { textTransform: "capitalize" }, children: p.mode }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(p.amount) })] }, p.id))), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(0,0,0,.06)" }, children: [_jsx("span", { children: "Remaining" }), _jsx("span", { style: { fontFamily: "var(--font-mono)", color: remaining > 0 ? "var(--color-red)" : "var(--color-green)" }, children: formatCurrency(remaining) })] })] }))] }) }), _jsxs("div", { style: { background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", padding: 24, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }, children: [_jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 500 }, children: "Collect payment" }), (bill.orderType === "takeaway" || bill.orderType === "delivery") && !loyaltyInfo && !bill.isPaid && (_jsxs("div", { style: { border: "1px solid var(--color-line)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("div", { style: { fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)" }, children: ["Customer ", _jsx("span", { style: { fontWeight: 400, color: "var(--color-ink-3)" }, children: "(optional \u00B7 for loyalty)" })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { value: custPhone, onChange: (e) => setCustPhone(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleLinkCustomer(), placeholder: "Phone number", style: { flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--color-line-strong)", padding: "0 10px", fontSize: 13, background: "var(--color-bg)", color: "var(--color-ink)", outline: "none", fontFamily: "inherit" }, onFocus: (e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)"), onBlur: (e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)") }), _jsx("input", { value: custName, onChange: (e) => setCustName(e.target.value), placeholder: "Name", style: { flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--color-line-strong)", padding: "0 10px", fontSize: 13, background: "var(--color-bg)", color: "var(--color-ink)", outline: "none", fontFamily: "inherit" }, onFocus: (e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)"), onBlur: (e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)") })] }), custErr && _jsx("div", { style: { fontSize: 12, color: "var(--color-red)" }, children: custErr }), _jsx("button", { onClick: handleLinkCustomer, disabled: !custPhone.trim() || custLinking, style: { height: 34, borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface-2)", color: "var(--color-ink-2)", fontSize: 13, fontFamily: "inherit", cursor: custPhone.trim() ? "pointer" : "not-allowed", opacity: custPhone.trim() ? 1 : .5 }, children: custLinking ? "Linking…" : "Add customer" })] })), (bill.discountLines ?? []).length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: (bill.discountLines ?? []).map((line) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--color-green-soft)", borderRadius: 8 }, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-green)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" }) }), _jsx("span", { style: { flex: 1, fontSize: 13, color: "var(--color-green)", fontWeight: 500 }, children: line.label }), _jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-green)", fontWeight: 600 }, children: ["\u2212 ", formatCurrency(line.amount)] }), bill.payments.length === 0 && (_jsx("button", { onClick: () => removeDiscountMutation.mutate(line.id), style: { border: "none", background: "transparent", cursor: "pointer", color: "var(--color-green)", padding: 2, display: "flex", alignItems: "center" }, children: _jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) }))] }, line.id))) })), bill.payments.length === 0 && discountPresets.filter((d) => d.isActive).length > 0 && (_jsxs("div", { children: [_jsxs("button", { onClick: () => { setShowDiscounts((v) => !v); setDiscountErr(""); }, style: { display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px dashed var(--color-line-strong)", background: "transparent", color: "var(--color-ink-3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" }), _jsx("circle", { cx: "7", cy: "7", r: "1.5", fill: "currentColor" })] }), showDiscounts ? "Hide discounts" : `Apply discount`, _jsx("span", { style: { marginLeft: 2, fontSize: 11, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 20, padding: "1px 7px", color: "var(--color-ink-3)" }, children: discountPresets.filter((d) => d.isActive).length }), _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { marginLeft: "auto", transform: showDiscounts ? "rotate(180deg)" : "none", transition: "transform .15s" }, children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), showDiscounts && (() => {
                                        const orderTotal = Number(bill.subtotal) + Number(bill.taxTotal);
                                        const active = discountPresets.filter((d) => d.isActive);
                                        const eligible = active.filter((d) => orderTotal >= Number(d.minOrderValue));
                                        const ineligible = active.filter((d) => orderTotal < Number(d.minOrderValue));
                                        const sorted = [...eligible, ...ineligible];
                                        return (_jsxs("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }, children: [discountErr && _jsx("div", { style: { fontSize: 12, color: "var(--color-red)", padding: "6px 10px", background: "var(--color-red-soft)", borderRadius: 6 }, children: discountErr }), sorted.length === 0 && _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", textAlign: "center", padding: "12px 0" }, children: "No discounts available" }), sorted.map((preset) => {
                                                    const isEligible = orderTotal >= Number(preset.minOrderValue);
                                                    const savings = isEligible ? calcSavings(preset, orderTotal) : 0;
                                                    const shortfall = Number(preset.minOrderValue) - orderTotal;
                                                    return (_jsxs("button", { onClick: () => isEligible && applyDiscount(preset), disabled: !isEligible || applyDiscountMutation.isPending, style: { display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 10, border: "1.5px solid " + (isEligible ? "var(--color-line)" : "var(--color-line)"), background: isEligible ? "var(--color-bg)" : "var(--color-surface-2)", cursor: isEligible ? "pointer" : "default", textAlign: "left", fontFamily: "inherit", opacity: isEligible ? 1 : .55, width: "100%" }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: isEligible ? "var(--color-green)" : "var(--color-ink-3)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0 }, children: [_jsx("path", { d: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" }), _jsx("circle", { cx: "7", cy: "7", r: "1", fill: "currentColor" })] }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }, children: preset.name }), preset.code && (_jsx("span", { style: { fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: ".06em", background: "var(--color-surface-2)", border: "1px solid var(--color-line-strong)", borderRadius: 4, padding: "1px 6px", color: "var(--color-ink-2)" }, children: preset.code }))] }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: isEligible
                                                                            ? preset.type === "percentage"
                                                                                ? `${preset.value}% off${preset.maxDiscountAmount ? ` · max ₹${preset.maxDiscountAmount}` : ""}`
                                                                                : `Flat ₹${preset.value} off`
                                                                            : `Add ${formatCurrency(shortfall)} more to unlock` })] }), isEligible && (_jsxs("div", { style: { textAlign: "right", flexShrink: 0 }, children: [_jsxs("div", { style: { fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-green)" }, children: ["\u2212", formatCurrency(savings)] }), _jsx("div", { style: { fontSize: 10, color: "var(--color-green)", marginTop: 1 }, children: "savings" })] }))] }, preset.id));
                                                })] }));
                                    })()] })), loyaltyInfo && !bill.isPaid && (_jsx("div", { style: { border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }, children: _jsxs("div", { style: { padding: "12px 14px", background: "var(--color-surface-2)", display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-amber)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }) }), _jsxs("div", { style: { flex: 1 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }, children: [loyaltyInfo.customer.name ?? loyaltyInfo.customer.phone, _jsx("span", { style: { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginLeft: 8, color: "var(--color-amber)", background: "rgba(245,158,11,.12)", padding: "2px 6px", borderRadius: 4 }, children: loyaltyInfo.tier })] }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }, children: [loyaltyInfo.totalPoints, " pts \u00B7 earn +", loyaltyInfo.pointsToEarn, " pts \u00B7 \u2248 ", formatCurrency(loyaltyInfo.redeemValue), " redeemable"] })] }), loyaltyInfo.totalPoints >= loyaltyInfo.program.minRedeemPoints && bill.payments.length === 0 && (_jsx("button", { onClick: () => { setShowRedeemModal(true); setRedeemPoints(String(loyaltyInfo.totalPoints)); setRedeemErr(""); }, style: { padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--color-amber)", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }, children: "Redeem" }))] }) })), _jsxs("div", { style: {
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
                                        }, onFocus: (e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)"), onBlur: (e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)") }), change > 0.005 && (_jsxs("div", { style: { marginTop: 6, fontSize: 13, color: "var(--color-green)", display: "flex", justifyContent: "space-between" }, children: [_jsx("span", { children: "Change due" }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontWeight: 600 }, children: formatCurrency(change) })] }))] }), _jsx("div", { style: { flex: 1 } }), _jsxs("button", { onClick: handleCollect, disabled: remaining <= 0 || payMutation.isPending || initiateUpiMutation.isPending, style: {
                                    height: 56, borderRadius: 14,
                                    background: "var(--color-green)",
                                    border: "1px solid oklch(58% 0.13 150)",
                                    color: "white",
                                    fontSize: 16, fontWeight: 600, fontFamily: "inherit",
                                    cursor: remaining > 0 ? "pointer" : "not-allowed",
                                    opacity: remaining > 0 ? 1 : .4,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                }, children: [(payMutation.isPending || initiateUpiMutation.isPending) ? "Processing…" : mode === "upi" ? "Generate QR" : `Collect ${formatCurrency(Math.min(collectAmt, remaining))}`, !payMutation.isPending && !initiateUpiMutation.isPending && (_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) }))] })] })] }), showRedeemModal && loyaltyInfo && (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }, onClick: () => setShowRedeemModal(false), children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 360, padding: 24, boxShadow: "var(--shadow-3)", display: "flex", flexDirection: "column", gap: 16 }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: "Redeem Points" }), _jsxs("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 4 }, children: ["Balance: ", _jsxs("b", { style: { color: "var(--color-ink)" }, children: [loyaltyInfo.totalPoints, " pts"] }), " \u00B7 100 pts = \u20B9", (100 / Number(loyaltyInfo.program.redeemRate)).toFixed(0)] })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", display: "block", marginBottom: 6 }, children: "Points to redeem" }), _jsx("input", { type: "number", value: redeemPoints, onChange: (e) => setRedeemPoints(e.target.value), min: loyaltyInfo.program.minRedeemPoints, max: loyaltyInfo.totalPoints, style: { width: "100%", height: 44, borderRadius: 10, border: "1px solid var(--color-line-strong)", padding: "0 14px", fontSize: 16, fontFamily: "var(--font-mono)", background: "var(--color-bg)", color: "var(--color-ink)", outline: "none", boxSizing: "border-box" } }), redeemPoints && (_jsxs("div", { style: { fontSize: 12, color: "var(--color-green)", marginTop: 6 }, children: ["= ", formatCurrency(parseFloat(redeemPoints) / Number(loyaltyInfo.program.redeemRate)), " off"] })), redeemErr && _jsx("div", { style: { fontSize: 12, color: "var(--color-red)", marginTop: 6 }, children: redeemErr })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => setShowRedeemModal(false), style: { flex: 1, height: 44, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }), _jsx("button", { onClick: () => { const p = parseInt(redeemPoints, 10); if (!p || p < loyaltyInfo.program.minRedeemPoints) {
                                        setRedeemErr(`Minimum ${loyaltyInfo.program.minRedeemPoints} pts`);
                                        return;
                                    } redeemMutation.mutate(p); }, disabled: redeemMutation.isPending, style: { flex: 2, height: 44, borderRadius: 10, border: "none", background: "var(--color-amber)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "inherit", opacity: redeemMutation.isPending ? .6 : 1 }, children: redeemMutation.isPending ? "Applying…" : "Apply discount" })] })] }) })), upiPayment && (_jsxs("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }, children: [_jsx("style", { children: `
            @keyframes pulse-qr { 0%, 100% { opacity: .35; transform: scale(1); } 50% { opacity: 0; transform: scale(1.04); } }
            @keyframes pulse-dot { 0%, 100% { opacity: .4 } 50% { opacity: 1 } }
          ` }), _jsxs("div", { style: { width: 340, background: "white", borderRadius: 20, boxShadow: "0 30px 80px rgba(0,0,0,.4)", padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }, children: [_jsxs("div", { style: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-accent)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M14 4l-6 16M9 4l-2 8h6l-2 8" }) }), _jsx("span", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "UPI Payment" })] }), _jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }, children: "Scan to pay" })] }), _jsx("button", { onClick: () => { clearInterval(pollRef.current); api.bills.cancelUpi(billId, upiPayment.paymentId).catch(() => { }); setUpiPayment(null); }, style: { width: 30, height: 30, borderRadius: 8, background: "var(--color-surface-2)", border: "none", color: "var(--color-ink-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: _jsx("path", { d: "M18 6 6 18M6 6l12 12" }) }) })] }), _jsxs("div", { style: { position: "relative", padding: 14, background: "#fafaf7", borderRadius: 14, border: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { position: "absolute", inset: -3, borderRadius: 16, border: "2px solid var(--color-accent)", opacity: 0.35, animation: "pulse-qr 1.8s ease-out infinite" } }), upiPayment.qrData.startsWith("upi://") ? (_jsx(QRCode, { value: upiPayment.qrData, size: 192 })) : (_jsxs("div", { style: { width: 192, height: 192, background: "var(--color-surface-2)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed var(--color-line-strong)" }, children: [_jsxs("svg", { width: "40", height: "40", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-ink-3)", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "3", y: "14", width: "7", height: "7" }), _jsx("path", { d: "M14 14h.01M14 17h3M17 14h3v3M17 20h3" })] }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", textAlign: "center", padding: "0 12px" }, children: "Configure UPI VPA in Outlet Settings to show QR" })] })), _jsx("div", { style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 36, height: 36, borderRadius: 9, background: "white", boxShadow: "0 2px 6px rgba(0,0,0,.15)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("div", { style: { width: 26, height: 26, borderRadius: 6, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("span", { style: { color: "white", fontSize: 13, fontWeight: 700, lineHeight: 1 }, children: "i" }) }) })] }), _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 500 }, children: "Amount due" }), _jsx("div", { style: { fontSize: 32, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 4, letterSpacing: "-.02em", color: "var(--color-ink)" }, children: formatCurrency(upiPayment.amountDue) })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-ink-3)" }, children: [upiPayment.mode !== "stub" && (_jsx("div", { style: { width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse-dot 1.4s ease-in-out infinite" } })), _jsx("span", { children: upiPayment.mode === "stub" ? "Stub mode — use simulate button" : "Waiting for payment confirmation" })] }), _jsxs("div", { style: { display: "flex", gap: 8, width: "100%" }, children: [_jsx("button", { className: "btn", onClick: () => { clearInterval(pollRef.current); api.bills.cancelUpi(billId, upiPayment.paymentId).catch(() => { }); setUpiPayment(null); }, style: { flex: 1, justifyContent: "center", height: 42 }, children: "Cancel" }), _jsx("button", { className: "btn btn-primary", onClick: () => simulateUpiMutation.mutate(upiPayment.paymentId), disabled: simulateUpiMutation.isPending, style: { flex: 1, justifyContent: "center", height: 42 }, children: simulateUpiMutation.isPending ? "Confirming…" : "Simulate ✓" })] }), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-4)", textAlign: "center" }, children: ["Expires ", _jsx("span", { style: { fontFamily: "var(--font-mono)", color: "var(--color-ink-3)" }, children: new Date(upiPayment.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) })] })] })] }))] }));
}
