import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
import { TopBar } from "@/components/ui/TopBar";
function elapsed(iso) {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60)
        return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const TONE = { available: "green", occupied: "amber", billed: "red", reserved: "blue" };
const LABEL = { available: "Free", occupied: "Open", billed: "Bill ready", reserved: "Reserved" };
function TableCard({ table, onClick }) {
    const tone = TONE[table.status];
    const isBilled = table.status === "billed";
    const isOpen = table.status === "occupied";
    const isFree = table.status === "available";
    const isRes = table.status === "reserved";
    return (_jsxs("button", { onClick: onClick, style: {
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
        }, onMouseEnter: (e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-2)"; }, onMouseLeave: (e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = isBilled ? "var(--shadow-2)" : "var(--shadow-1)"; }, children: [_jsx("div", { style: { height: 3, background: `var(--color-${tone})`, flexShrink: 0 } }), isBilled && (_jsx("div", { className: "animate-pulse-red", style: {
                    position: "absolute", top: 14, right: 14,
                    width: 8, height: 8, borderRadius: "50%",
                    background: "var(--color-red)",
                } })), _jsxs("div", { style: { padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 20, fontWeight: 600, letterSpacing: "-.01em", lineHeight: 1 }, children: table.name }), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }, children: [_jsxs("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "9", cy: "8", r: "3.5" }), _jsx("path", { d: "M2 20c0-3.3 3-6 7-6s7 2.7 7 6" }), _jsx("path", { d: "M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7" })] }), table.capacity, " seats"] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }, children: [_jsxs("span", { className: `badge ${tone}`, children: [_jsx("span", { className: `dot ${tone}` }), " ", LABEL[table.status]] }), table.source === "qr" && (isOpen || isBilled) && (_jsx("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-blue)", background: "rgba(59,130,246,.1)", padding: "2px 6px", borderRadius: 5 }, children: "QR" }))] })] }), _jsxs("div", { style: { marginTop: "auto", paddingTop: 10 }, children: [isFree && _jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: "Tap to seat guests" }), isRes && _jsx("div", { style: { fontSize: 12, color: "var(--color-blue)" }, children: "Reserved" }), (isOpen || isBilled) && table.openedAt && (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: [elapsed(table.openedAt), " \u00B7 ", table.items ?? 0, " items"] }), table.total != null && (_jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }, children: formatCurrency(table.total) }))] }))] })] })] }));
}
export default function FloorPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    // Customer lookup modal for takeaway/delivery
    const [orderModal, setOrderModal] = useState(null);
    const [phone, setPhone] = useState("");
    const [custName, setCustName] = useState("");
    const [foundCustomer, setFoundCustomer] = useState(undefined); // undefined = not searched yet
    const [searching, setSearching] = useState(false);
    const [creating, setCreating] = useState(false);
    const phoneRef = useRef(null);
    useEffect(() => {
        if (orderModal) {
            setPhone("");
            setCustName("");
            setFoundCustomer(undefined);
            setTimeout(() => phoneRef.current?.focus(), 50);
        }
    }, [orderModal]);
    async function searchCustomer() {
        if (!phone.trim())
            return;
        setSearching(true);
        try {
            const results = await api.customers.search(phone.trim());
            const exact = results.find((c) => c.phone === phone.trim());
            setFoundCustomer(exact ?? null);
            if (exact)
                setCustName(exact.name ?? "");
        }
        finally {
            setSearching(false);
        }
    }
    async function confirmOrder() {
        if (!orderModal)
            return;
        setCreating(true);
        try {
            let customerId;
            if (phone.trim()) {
                const cust = await api.customers.upsert({ phone: phone.trim(), name: custName.trim() || undefined });
                customerId = cust.id;
            }
            const order = await api.orders.create({ type: orderModal, customerId });
            setOrderModal(null);
            navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined } });
        }
        finally {
            setCreating(false);
        }
    }
    const { data, isLoading } = useQuery({
        queryKey: ["tables"],
        queryFn: () => api.tables.getAll(),
    });
    useEffect(() => {
        const invalidate = () => qc.invalidateQueries({ queryKey: ["tables"] });
        const u1 = ws.on("table.status", invalidate);
        const u2 = ws.on("order.updated", invalidate);
        const u3 = ws.on("order.created", invalidate);
        return () => { u1(); u2(); u3(); };
    }, [qc]);
    function handleTableClick(table) {
        if (table.status === "available") {
            // Navigate without creating an order — the order is created lazily when the first item is added
            navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id } });
        }
        else if (table.currentOrderId) {
            navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined } });
        }
    }
    const floors = data?.floors ?? [];
    const tables = data?.tables ?? [];
    const stats = {
        free: tables.filter((t) => t.status === "available").length,
        open: tables.filter((t) => t.status === "occupied").length,
        billed: tables.filter((t) => t.status === "billed").length,
    };
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }, children: [_jsx(TopBar, { current: "floor", stats: stats, onTakeaway: () => setOrderModal("takeaway"), onDelivery: () => setOrderModal("delivery") }), _jsx("div", { className: "scroll", style: { flex: 1, padding: "20px 24px" }, children: isLoading ? (_jsx("div", { style: { textAlign: "center", padding: 80, color: "var(--color-ink-3)" }, children: "Loading tables\u2026" })) : floors.length === 0 ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16 }, children: [_jsx("div", { style: { width: 64, height: 64, borderRadius: 18, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }, children: _jsxs("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] }) }), _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 17, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }, children: "No tables yet" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", maxWidth: 280 }, children: "Set up your floor layout in Manager settings so staff can start taking orders." })] }), _jsxs("a", { href: "/manager", style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, textDecoration: "none" }, children: ["Go to Manager settings", _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })] })] })) : (floors.map((floor) => {
                    const floorTables = tables.filter((t) => t.floorId === floor.id);
                    return (_jsxs("div", { style: { marginBottom: 28 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-ink-2)", letterSpacing: ".04em", textTransform: "uppercase" }, children: floor.name }), _jsx("div", { style: { flex: 1, height: 1, background: "var(--color-line)" } }), _jsxs("span", { style: { fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }, children: [floorTables.filter((t) => t.status === "available").length, " / ", floorTables.length, " free"] })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }, children: floorTables.map((table) => (_jsx(TableCard, { table: table, onClick: () => handleTableClick(table) }, table.id))) })] }, floor.id));
                })) }), orderModal && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 420, boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsxs("div", { style: { fontSize: 16, fontWeight: 600, textTransform: "capitalize" }, children: ["New ", orderModal, " Order"] }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Look up or add a customer (optional)" })] }), _jsxs("div", { style: { padding: 20, display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", display: "block", marginBottom: 6 }, children: "Phone number" }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("input", { ref: phoneRef, value: phone, onChange: (e) => { setPhone(e.target.value); setFoundCustomer(undefined); }, onKeyDown: (e) => e.key === "Enter" && searchCustomer(), placeholder: "e.g. 9876543210", style: { flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-line)", padding: "0 12px", fontSize: 14, background: "var(--color-bg)", color: "var(--color-ink)", outline: "none" } }), _jsx("button", { onClick: searchCustomer, disabled: searching || !phone.trim(), style: { height: 40, padding: "0 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-surface-2)", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit", whiteSpace: "nowrap" }, children: searching ? "…" : "Search" })] })] }), foundCustomer === null && (_jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", background: "var(--color-surface-2)", borderRadius: 10, padding: "10px 14px" }, children: "No customer found \u2014 will create new" })), foundCustomer && (_jsxs("div", { style: { background: "var(--color-surface-2)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }, children: foundCustomer.name ?? "—" }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }, children: [foundCustomer.phone, " \u00B7 ", foundCustomer.loyaltyPoints, " pts"] })] }), _jsx("span", { style: { fontSize: 11, background: "var(--color-green-soft)", color: "var(--color-green)", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }, children: "Found" })] })), (foundCustomer === null || foundCustomer === undefined) && (_jsxs("div", { children: [_jsxs("label", { style: { fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", display: "block", marginBottom: 6 }, children: ["Name ", _jsx("span", { style: { color: "var(--color-ink-4)", fontWeight: 400 }, children: "(optional)" })] }), _jsx("input", { value: custName, onChange: (e) => setCustName(e.target.value), placeholder: "Customer name", style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", padding: "0 12px", fontSize: 14, background: "var(--color-bg)", color: "var(--color-ink)", outline: "none", boxSizing: "border-box" } })] }))] }), _jsxs("div", { style: { padding: "0 20px 20px", display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => setOrderModal(null), style: { flex: 1, height: 44, borderRadius: 12, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }), _jsx("button", { onClick: confirmOrder, disabled: creating, style: { flex: 2, height: 44, borderRadius: 12, border: "none", background: "var(--color-ink)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-bg)", fontFamily: "inherit", opacity: creating ? .6 : 1 }, children: creating ? "Creating…" : `Start ${orderModal}` })] })] }) }))] }));
}
