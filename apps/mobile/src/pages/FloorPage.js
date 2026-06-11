import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
const STATUS_COLOR = {
    available: "var(--color-green)",
    occupied: "var(--color-amber)",
    billed: "var(--color-red)",
    reserved: "var(--color-blue)",
};
const STATUS_LABEL = {
    available: "Free",
    occupied: "Open",
    billed: "Bill ready",
    reserved: "Reserved",
};
const STATUS_TONE = {
    available: "green",
    occupied: "amber",
    billed: "red",
    reserved: "blue",
};
function elapsed(iso) {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60)
        return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function TableCard({ table, onClick }) {
    const isBilled = table.status === "billed";
    const isOpen = table.status === "occupied";
    return (_jsxs("button", { onClick: onClick, style: {
            textAlign: "left", width: "100%",
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            borderRadius: 16, padding: 0, cursor: "pointer",
            boxShadow: isBilled ? "var(--shadow-2)" : "var(--shadow-1)",
            overflow: "hidden", minHeight: 100,
            display: "flex", flexDirection: "column",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
        }, children: [_jsx("div", { style: { height: 4, background: STATUS_COLOR[table.status], flexShrink: 0 } }), isBilled && (_jsx("div", { className: "animate-pulse-red", style: {
                    position: "absolute", top: 16, right: 16,
                    width: 8, height: 8, borderRadius: "50%",
                    background: "var(--color-red)",
                } })), _jsxs("div", { style: { padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("span", { style: { fontSize: 18, fontWeight: 600 }, children: table.name }), _jsxs("span", { className: `badge ${STATUS_TONE[table.status]}`, children: [_jsx("span", { className: `dot ${STATUS_TONE[table.status]}` }), STATUS_LABEL[table.status]] })] }), _jsxs("div", { style: { marginTop: "auto", paddingTop: 10 }, children: [table.status === "available" && (_jsx("div", { style: { fontSize: 12, color: "var(--color-ink-4)" }, children: "Tap to start order" })), (isOpen || isBilled) && table.openedAt && (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: [elapsed(table.openedAt), " \u00B7 ", table.items ?? 0, " items"] }), table.total != null && (_jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }, children: formatCurrency(table.total) }))] }))] })] })] }));
}
export default function FloorPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { logout, user, outletName } = useAuthStore();
    const [activeFloor, setActiveFloor] = useState(null);
    const { data, isLoading } = useQuery({
        queryKey: ["tables"],
        queryFn: () => api.tables.getAll(),
    });
    const { data: seatedEntries = [] } = useQuery({
        queryKey: ["queue-seated"],
        queryFn: () => api.queue.listSeated(),
        refetchOnWindowFocus: false,
    });
    const floors = data?.floors ?? [];
    const tables = data?.tables ?? [];
    // Set initial active floor
    useEffect(() => {
        if (floors.length && !activeFloor)
            setActiveFloor(floors[0]?.id ?? null);
    }, [floors, activeFloor]);
    // Live updates
    useEffect(() => {
        const unsub = ws.on("*", () => {
            qc.invalidateQueries({ queryKey: ["tables"] });
            qc.invalidateQueries({ queryKey: ["queue-seated"] });
        });
        return unsub;
    }, [qc]);
    function handleTableTap(table) {
        if (table.status === "billed")
            return; // captain can't bill
        if (table.currentOrderId) {
            navigate({ to: "/order/$orderId", params: { orderId: table.currentOrderId }, search: { tableId: undefined, customerId: undefined } });
        }
        else {
            const seatedEntry = seatedEntries.find((e) => e.tableId === table.id);
            navigate({ to: "/order/$orderId", params: { orderId: "new" }, search: { tableId: table.id, customerId: seatedEntry?.customerId ?? undefined } });
        }
    }
    const floorTables = tables.filter((t) => t.floorId === activeFloor);
    const free = tables.filter((t) => t.status === "available").length;
    const open = tables.filter((t) => t.status === "occupied").length;
    const billed = tables.filter((t) => t.status === "billed").length;
    return (_jsxs("div", { style: {
            height: "100dvh", display: "flex", flexDirection: "column",
            background: "var(--color-bg)",
        }, children: [_jsxs("div", { style: {
                    paddingTop: "calc(12px + var(--safe-top))",
                    paddingLeft: 16, paddingRight: 16, paddingBottom: 12,
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-line)",
                    flexShrink: 0,
                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 16, fontWeight: 700 }, children: outletName ?? "InBill" }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 1 }, children: [user?.name, " \u00B7 Captain"] })] }), _jsx("button", { onClick: logout, style: {
                                    background: "transparent", border: "none", padding: "8px 12px",
                                    fontSize: 13, color: "var(--color-ink-3)", cursor: "pointer",
                                }, children: "Sign out" })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10 }, children: [_jsxs("span", { className: "badge green", children: [_jsx("span", { className: "dot green" }), free, " free"] }), _jsxs("span", { className: "badge amber", children: [_jsx("span", { className: "dot amber" }), open, " open"] }), billed > 0 && _jsxs("span", { className: "badge red", children: [_jsx("span", { className: "dot red" }), billed, " billing"] })] })] }), floors.length > 1 && (_jsx("div", { style: {
                    display: "flex", gap: 0, overflowX: "auto",
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-line)",
                    flexShrink: 0, scrollbarWidth: "none",
                }, children: floors.map((f) => (_jsx("button", { onClick: () => setActiveFloor(f.id), style: {
                        padding: "10px 18px",
                        fontSize: 13, fontWeight: activeFloor === f.id ? 600 : 400,
                        color: activeFloor === f.id ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                        background: "transparent", border: "none", cursor: "pointer",
                        borderBottom: `2px solid ${activeFloor === f.id ? "var(--color-accent)" : "transparent"}`,
                        whiteSpace: "nowrap",
                        WebkitTapHighlightColor: "transparent",
                    }, children: f.name }, f.id))) })), _jsxs("div", { className: "scroll", style: { flex: 1, padding: 12, paddingBottom: "calc(12px + var(--safe-bottom))" }, children: [isLoading && (_jsx("div", { style: { textAlign: "center", padding: 48, color: "var(--color-ink-3)" }, children: "Loading tables\u2026" })), !isLoading && floorTables.length === 0 && (_jsx("div", { style: { textAlign: "center", padding: 48, color: "var(--color-ink-3)" }, children: "No tables on this floor" })), _jsx("div", { style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 1fr)",
                            gap: 10,
                        }, children: floorTables.map((t) => (_jsx("div", { style: { position: "relative" }, children: _jsx(TableCard, { table: t, onClick: () => handleTableTap(t) }) }, t.id))) })] })] }));
}
