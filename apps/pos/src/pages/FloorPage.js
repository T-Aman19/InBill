import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
function elapsed(iso) {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60)
        return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function waitMinutes(joinedAt) {
    return Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60000));
}
function initials(name) {
    return name.split(" ").map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase();
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
                } })), _jsxs("div", { style: { padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsxs("div", { children: [_jsx("div", { className: "display", style: { fontSize: 20, fontWeight: 600, lineHeight: 1 }, children: table.name }), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }, children: [_jsxs("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "9", cy: "8", r: "3.5" }), _jsx("path", { d: "M2 20c0-3.3 3-6 7-6s7 2.7 7 6" }), _jsx("path", { d: "M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7" })] }), table.capacity, " seats"] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }, children: [_jsxs("span", { className: `badge ${tone}`, children: [_jsx("span", { className: `dot ${tone}` }), " ", LABEL[table.status]] }), table.source === "qr" && (isOpen || isBilled) && (_jsx("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--color-blue)", background: "var(--color-blue-soft)", padding: "2px 6px", borderRadius: 5 }, children: "QR" }))] })] }), _jsxs("div", { style: { marginTop: "auto", paddingTop: 10 }, children: [isFree && _jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: "Tap to seat guests" }), isRes && _jsx("div", { style: { fontSize: 12, color: "var(--color-blue)" }, children: "Reserved" }), (isOpen || isBilled) && table.openedAt && (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: [elapsed(table.openedAt), " \u00B7 ", table.items ?? 0, " items"] }), table.total != null && (_jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }, children: formatCurrency(table.total) }))] }))] })] })] }));
}
function QueuePanel({ tables }) {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [seatEntry, setSeatEntry] = useState(null);
    const [form, setForm] = useState({ customerName: "", customerPhone: "", partySize: 2 });
    const [formError, setFormError] = useState("");
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 60000);
        return () => clearInterval(t);
    }, []);
    const { data: entries = [] } = useQuery({
        queryKey: ["queue"],
        queryFn: () => api.queue.list("waiting"),
        refetchOnWindowFocus: false,
    });
    useEffect(() => {
        return ws.on("queue.updated", (e) => {
            qc.setQueryData(["queue"], e.payload.entries.filter((x) => x.status === "waiting"));
        });
    }, [qc]);
    const addMutation = useMutation({
        mutationFn: () => api.queue.addWalkIn({ customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() || null, partySize: form.partySize }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue"] }); setShowModal(false); setForm({ customerName: "", customerPhone: "", partySize: 2 }); setFormError(""); },
        onError: (e) => setFormError(e.message ?? "Failed to add"),
    });
    const seatMutation = useMutation({
        mutationFn: ({ entryId, tableId }) => api.queue.seat(entryId, tableId),
        onSuccess: (data, { tableId }) => {
            qc.invalidateQueries({ queryKey: ["queue"] });
            qc.invalidateQueries({ queryKey: ["tables"] });
            setSeatEntry(null);
            navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId, customerId: data.customerId ?? undefined } });
        },
    });
    const cancelMutation = useMutation({
        mutationFn: ({ id, status }) => api.queue.cancel(id, status),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
    });
    const freeTables = tables.filter((t) => t.status === "available");
    return (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => setOpen((v) => !v), style: {
                    position: "fixed", right: open ? 300 : 0, top: "50%", transform: "translateY(-50%)",
                    zIndex: 30, background: "var(--color-surface)", border: "1px solid var(--color-line)",
                    borderRight: open ? "none" : undefined,
                    borderRadius: "8px 0 0 8px",
                    padding: "14px 6px", cursor: "pointer", transition: "right .2s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    boxShadow: "var(--shadow-1)",
                }, title: open ? "Close queue" : "Open queue", children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-ink-2)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" })] }), entries.length > 0 && (_jsx("span", { style: { fontSize: 10, fontWeight: 700, background: "var(--color-amber)", color: "#000", borderRadius: 10, padding: "1px 5px", minWidth: 16, textAlign: "center" }, children: entries.length }))] }), _jsxs("div", { style: {
                    position: "fixed", right: 0, top: 0, bottom: 0, width: 300,
                    background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)",
                    zIndex: 29, display: "flex", flexDirection: "column",
                    transform: open ? "translateX(0)" : "translateX(100%)",
                    transition: "transform .2s", boxShadow: open ? "-4px 0 16px rgba(0,0,0,.12)" : "none",
                }, children: [_jsxs("div", { style: { padding: "16px 16px 12px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, fontSize: 14 }, children: "Queue" }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }, children: entries.length === 0 ? "No one waiting" : `${entries.length} waiting` })] }), _jsxs("button", { onClick: () => setShowModal(true), style: { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }, children: [_jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: _jsx("path", { d: "M12 5v14M5 12h14" }) }), "Add"] })] }), _jsx("div", { className: "scroll", style: { flex: 1, padding: 10 }, children: entries.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: "40px 16px", color: "var(--color-ink-3)", fontSize: 13 }, children: "No walk-ins waiting" })) : (entries.map((entry) => (_jsx("div", { style: { background: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }, children: _jsxs("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }, children: [_jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "rgba(251,191,36,.15)", color: "var(--color-amber)", border: "1px solid rgba(251,191,36,.3)", borderRadius: 5, padding: "1px 6px" }, children: entry.token }), _jsx("span", { style: { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: entry.customerName })] }), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", display: "flex", gap: 8 }, children: [_jsxs("span", { children: [entry.partySize, " ", entry.partySize === 1 ? "guest" : "guests"] }), _jsxs("span", { children: [waitMinutes(entry.joinedAt), "m wait"] })] })] }), _jsxs("div", { style: { display: "flex", gap: 4, flexShrink: 0 }, children: [_jsx("button", { onClick: () => setSeatEntry(entry), style: { fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 6, background: "var(--color-green)", color: "#fff", border: "none", cursor: "pointer" }, children: "Seat" }), _jsx("div", { style: { position: "relative" }, children: _jsx(KebabMenu, { entry: entry, onCancel: (status) => cancelMutation.mutate({ id: entry.id, status }) }) })] })] }) }, entry.id)))) })] }), showModal && (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: (e) => { if (e.target === e.currentTarget)
                    setShowModal(false); }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: 360, boxShadow: "var(--shadow-3)" }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 16, marginBottom: 18 }, children: "Add Walk-in" }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 5 }, children: "Customer name *" }), _jsx("input", { autoFocus: true, value: form.customerName, onChange: (e) => setForm((f) => ({ ...f, customerName: e.target.value })), placeholder: "e.g. Rahul", style: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, boxSizing: "border-box" }, onKeyDown: (e) => { if (e.key === "Enter" && form.customerName.trim())
                                                addMutation.mutate(); } })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 5 }, children: "Phone (optional)" }), _jsx("input", { value: form.customerPhone, onChange: (e) => setForm((f) => ({ ...f, customerPhone: e.target.value })), placeholder: "+91 98765 43210", style: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, boxSizing: "border-box" } })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 12, color: "var(--color-ink-2)", fontWeight: 600, display: "block", marginBottom: 8 }, children: "Party size" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [_jsx("button", { onClick: () => setForm((f) => ({ ...f, partySize: Math.max(1, f.partySize - 1) })), style: { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }, children: "\u2212" }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, minWidth: 28, textAlign: "center" }, children: form.partySize }), _jsx("button", { onClick: () => setForm((f) => ({ ...f, partySize: Math.min(50, f.partySize + 1) })), style: { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink)" }, children: "+" })] })] }), formError && _jsx("div", { style: { fontSize: 12, color: "var(--color-red)" }, children: formError })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 20 }, children: [_jsx("button", { onClick: () => setShowModal(false), style: { flex: 1, padding: "10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-ink)", fontSize: 14, cursor: "pointer" }, children: "Cancel" }), _jsx("button", { onClick: () => { if (!form.customerName.trim()) {
                                        setFormError("Name is required");
                                        return;
                                    } addMutation.mutate(); }, disabled: addMutation.isPending, style: { flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: addMutation.isPending ? 0.6 : 1 }, children: addMutation.isPending ? "Adding…" : "Add to queue" })] })] }) })), seatEntry && (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: (e) => { if (e.target === e.currentTarget)
                    setSeatEntry(null); }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: 380, boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { fontWeight: 700, fontSize: 16, marginBottom: 4 }, children: ["Seat ", seatEntry.customerName] }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16 }, children: [seatEntry.partySize, " ", seatEntry.partySize === 1 ? "guest" : "guests", " \u00B7 token ", seatEntry.token] }), freeTables.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: "24px 0", color: "var(--color-ink-3)", fontSize: 13 }, children: "No free tables available" })) : (_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }, children: freeTables.map((t) => (_jsxs("button", { onClick: () => seatMutation.mutate({ entryId: seatEntry.id, tableId: t.id }), disabled: seatMutation.isPending, style: { padding: "12px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }, children: [_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-green)", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] }), t.name, _jsxs("span", { style: { fontSize: 10, color: "var(--color-ink-3)" }, children: [t.capacity, " seats"] })] }, t.id))) })), _jsx("button", { onClick: () => setSeatEntry(null), style: { width: "100%", marginTop: 16, padding: "10px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-ink)", fontSize: 14, cursor: "pointer" }, children: "Cancel" })] }) }))] }));
}
function KebabMenu({ entry, onCancel }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target))
            setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    return (_jsxs("div", { ref: ref, style: { position: "relative" }, children: [_jsx("button", { onClick: () => setOpen((v) => !v), style: { width: 28, height: 28, borderRadius: 6, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }, children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", children: [_jsx("circle", { cx: "12", cy: "5", r: "1.5" }), _jsx("circle", { cx: "12", cy: "12", r: "1.5" }), _jsx("circle", { cx: "12", cy: "19", r: "1.5" })] }) }), open && (_jsxs("div", { style: { position: "absolute", right: 0, top: 32, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, boxShadow: "var(--shadow-2)", zIndex: 10, minWidth: 130, overflow: "hidden" }, children: [_jsx("button", { onClick: () => { onCancel("no_show"); setOpen(false); }, style: { width: "100%", padding: "9px 14px", textAlign: "left", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-amber)" }, children: "No-show" }), _jsx("button", { onClick: () => { onCancel("cancelled"); setOpen(false); }, style: { width: "100%", padding: "9px 14px", textAlign: "left", fontSize: 13, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-red)" }, children: "Cancel" })] }))] }));
}
export default function FloorPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { user, outletName, setupCode, logout } = useAuthStore();
    const [creating, setCreating] = useState(false);
    const [copied, setCopied] = useState(false);
    const isManagerOrOwner = user?.role === "manager" || user?.role === "owner";
    async function startOrder(type) {
        if (creating)
            return;
        setCreating(true);
        try {
            const order = await api.orders.create({ type });
            navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined, customerId: undefined } });
        }
        finally {
            setCreating(false);
        }
    }
    const { data, isLoading } = useQuery({
        queryKey: ["tables"],
        queryFn: () => api.tables.getAll(),
    });
    const { data: outlet } = useQuery({
        queryKey: ["outlet"],
        queryFn: () => api.outlet.get(),
        staleTime: 5 * 60 * 1000,
    });
    const { data: counterOrders = [] } = useQuery({
        queryKey: ["counter-orders"],
        queryFn: () => api.orders.getCounter(),
        refetchInterval: 30_000,
    });
    const { data: lowStockData } = useQuery({
        queryKey: ["low-stock-count"],
        queryFn: () => api.inventory.lowStockCount(),
        enabled: isManagerOrOwner,
        refetchInterval: 60_000,
    });
    useEffect(() => {
        const invalidateTables = () => qc.invalidateQueries({ queryKey: ["tables"] });
        const invalidateCounter = () => qc.invalidateQueries({ queryKey: ["counter-orders"] });
        const u1 = ws.on("table.status", invalidateTables);
        const u2 = ws.on("order.updated", () => { invalidateTables(); invalidateCounter(); });
        const u3 = ws.on("order.created", () => { invalidateTables(); invalidateCounter(); });
        return () => { u1(); u2(); u3(); };
    }, [qc]);
    function handleTableClick(table) {
        if (table.status === "available") {
            navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id, customerId: undefined } });
        }
        else if (table.currentOrderId) {
            navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined, customerId: undefined } });
        }
    }
    const floors = data?.floors ?? [];
    const tables = data?.tables ?? [];
    const stats = {
        free: tables.filter((t) => t.status === "available").length,
        open: tables.filter((t) => t.status === "occupied").length,
        billed: tables.filter((t) => t.status === "billed").length,
    };
    const lowStockCount = lowStockData?.count ?? 0;
    const displaySetupCode = setupCode ?? outlet?.setupCode ?? null;
    function copyCode() {
        if (!displaySetupCode)
            return;
        navigator.clipboard.writeText(displaySetupCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }, children: [_jsxs("div", { style: {
                    height: 56, flexShrink: 0,
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-line)",
                    display: "flex", alignItems: "center",
                    padding: "0 20px", gap: 14,
                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }, children: [_jsx("div", { style: { width: 28, height: 28, borderRadius: 7, background: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("span", { style: { color: "var(--color-bg)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)" }, children: "i" }) }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink)", lineHeight: 1.15 }, children: outletName }), displaySetupCode ? (_jsx("button", { onClick: copyCode, style: { background: "none", border: "none", padding: 0, cursor: "pointer" }, children: _jsx("span", { style: { fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: ".06em", color: copied ? "var(--v2-marigold-ink)" : "var(--color-ink-4)", fontWeight: 500, transition: "color .15s" }, children: copied ? "Copied!" : displaySetupCode }) })) : (_jsx("div", { style: { fontSize: 10, color: "var(--color-ink-4)" }, children: "Terminal 01" }))] })] }), _jsx("div", { style: { display: "flex", background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 10, padding: 4, flexShrink: 0 }, children: ([
                            { label: "Free", dot: "green", val: stats.free },
                            { label: "Open", dot: "amber", val: stats.open },
                            { label: "Billed", dot: "red", val: stats.billed },
                        ]).map((s, i, arr) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRight: i < arr.length - 1 ? "1px solid var(--color-line)" : "none", fontSize: 12 }, children: [_jsx("span", { className: `dot ${s.dot}` }), _jsx("span", { style: { color: "var(--color-ink-3)" }, children: s.label }), _jsx("span", { style: { fontWeight: 600, fontFamily: "var(--font-mono)" }, children: s.val })] }, s.label))) }), _jsxs("button", { onClick: () => startOrder("takeaway"), disabled: creating, style: { display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, cursor: creating ? "not-allowed" : "pointer", flexShrink: 0, opacity: creating ? .6 : 1 }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z" }), _jsx("path", { d: "M8 8V6a4 4 0 018 0v2" }), _jsx("path", { d: "M9 13h6" })] }), "Takeaway"] }), outlet?.settings?.deliveryEnabled && (_jsxs("button", { onClick: () => startOrder("delivery"), disabled: creating, style: { display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 9, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, cursor: creating ? "not-allowed" : "pointer", flexShrink: 0, opacity: creating ? .6 : 1 }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M5 8h14M8 8V6a4 4 0 018 0v2" }), _jsx("rect", { x: "2", y: "8", width: "20", height: "12", rx: "2" }), _jsx("path", { d: "M12 12v4M10 14h4" })] }), "Delivery"] })), _jsx("div", { style: { flex: 1 } }), _jsx("div", { style: { display: "flex", gap: 2, alignItems: "center" }, children: [
                            { id: "floor", label: "Floor", path: "/floor", show: user?.role !== "kitchen",
                                icon: _jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] }) },
                            { id: "kds", label: "Kitchen", path: "/kds", show: user?.role !== "kitchen",
                                icon: _jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2" }), _jsx("path", { d: "M3 8h18M7 12h4M7 14h7" }), _jsx("path", { d: "M9 17v3M15 17v3M6 20h12" })] }) },
                            { id: "manager", label: "Manager", path: "/manager", show: isManagerOrOwner,
                                icon: _jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.8a7 7 0 00-2-1.2L14 3h-4l-.6 2.5a7 7 0 00-2 1.2L5.1 5.9l-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.8a7 7 0 002 1.2L10 21h4l.6-2.5a7 7 0 002-1.2l2.3.8 2-3.4-2-1.5c0-.4.1-.8.1-1.2z" })] }) },
                        ].filter((n) => n.show).map((n) => {
                            const active = n.id === "floor";
                            return (_jsxs("button", { onClick: () => navigate({ to: n.path }), style: {
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", borderRadius: 8,
                                    border: "1px solid " + (active ? "var(--color-line)" : "transparent"),
                                    background: active ? "var(--color-surface-2)" : "transparent",
                                    color: active ? "var(--color-ink)" : "var(--color-ink-3)",
                                    fontSize: 13, fontWeight: 500, cursor: "pointer",
                                    position: "relative",
                                }, children: [n.icon, n.label, n.id === "manager" && lowStockCount > 0 && (_jsx("span", { style: { background: "var(--color-red)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", lineHeight: 1.4 }, children: lowStockCount }))] }, n.id));
                        }) }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, borderLeft: "1px solid var(--color-line)", flexShrink: 0 }, children: [_jsx("div", { style: { width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }, children: initials(user?.name ?? "?") }), _jsxs("div", { style: { lineHeight: 1.2 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--color-ink)" }, children: user?.name }), _jsx("div", { style: { fontSize: 10, color: "var(--color-ink-3)", textTransform: "capitalize" }, children: user?.role })] }), _jsx("button", { onClick: () => { logout(); navigate({ to: "/login" }); }, title: "Logout", style: { background: "transparent", border: "none", color: "var(--color-ink-3)", width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }, onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.color = "var(--color-ink)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-ink-3)"; }, children: _jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" }) }) })] })] }), _jsx(QueuePanel, { tables: tables }), counterOrders.length > 0 && (_jsxs("div", { style: { flexShrink: 0, borderBottom: "1px solid var(--color-line)", background: "var(--color-surface)", padding: "12px 24px" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-amber)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" }), _jsx("line", { x1: "3", y1: "6", x2: "21", y2: "6" }), _jsx("path", { d: "M16 10a4 4 0 01-8 0" })] }), _jsx("span", { style: { fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-ink-2)" }, children: "Counter" }), _jsx("span", { style: { fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, background: "rgba(251,146,60,.12)", color: "var(--color-amber)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 20, padding: "1px 7px" }, children: counterOrders.length })] }), _jsx("div", { style: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }, children: counterOrders.map((order) => {
                            const isPaid = order.bill?.isPaid ?? false;
                            const isBuilding = order.status === "open";
                            const isAwaitingPayment = order.status === "billed" && !isPaid;
                            const statusColor = isBuilding ? "var(--color-ink-3)" : isAwaitingPayment ? "var(--color-amber)" : "var(--color-blue)";
                            const statusLabel = isBuilding ? "Building" : isAwaitingPayment ? "Awaiting payment" : "In kitchen";
                            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                            const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));
                            return (_jsxs("button", { onClick: () => navigate({ to: "/order/$orderId", params: { orderId: order.id }, search: { tableId: undefined, customerId: undefined } }), style: { flexShrink: 0, minWidth: 160, maxWidth: 200, padding: "10px 13px", borderRadius: 12, border: `1px solid ${isAwaitingPayment ? "rgba(251,146,60,.4)" : "var(--color-line)"}`, background: isAwaitingPayment ? "rgba(251,146,60,.06)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 5 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-ink-3)" }, children: order.type === "delivery" ? "Delivery" : "Takeaway" }), _jsxs("span", { style: { fontSize: 10, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }, children: [elapsedMin, "m"] })] }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-2)" }, children: [itemCount, " item", itemCount !== 1 ? "s" : ""] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }, children: [_jsx("span", { style: { fontSize: 10, fontWeight: 600, color: statusColor }, children: statusLabel }), order.bill && (_jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-ink)" }, children: ["\u20B9", Number(order.bill.total).toFixed(0)] }))] })] }, order.id));
                        }) })] })), _jsx("div", { className: "scroll", style: { flex: 1, padding: "20px 24px" }, children: isLoading ? (_jsx("div", { style: { textAlign: "center", padding: 80, color: "var(--color-ink-3)" }, children: "Loading tables\u2026" })) : floors.length === 0 ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", gap: 16 }, children: [_jsx("div", { style: { width: 64, height: 64, borderRadius: 18, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)" }, children: _jsxs("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] }) }), _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 17, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }, children: "No tables yet" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", maxWidth: 280 }, children: "Set up your floor layout in Manager settings so staff can start taking orders." })] }), _jsxs("a", { href: "/manager", style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, textDecoration: "none" }, children: ["Go to Manager settings", _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })] })] })) : (floors.map((floor) => {
                    const floorTables = tables.filter((t) => t.floorId === floor.id);
                    return (_jsxs("div", { style: { marginBottom: 28 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }, children: [_jsx("h3", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-ink-2)", letterSpacing: ".04em", textTransform: "uppercase" }, children: floor.name }), _jsx("div", { style: { flex: 1, height: 1, background: "var(--color-line)" } }), _jsxs("span", { style: { fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }, children: [floorTables.filter((t) => t.status === "available").length, " / ", floorTables.length, " free"] })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }, children: floorTables.map((table) => (_jsx(TableCard, { table: table, onClick: () => handleTableClick(table) }, table.id))) })] }, floor.id));
                })) })] }));
}
