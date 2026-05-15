import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";
function initials(name) {
    return name.split(" ").map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase();
}
export function TopBar({ current, stats, onTakeaway, onDelivery }) {
    const navigate = useNavigate();
    const { user, outletName, logout } = useAuthStore();
    const isManagerOrOwner = user?.role === "manager" || user?.role === "owner";
    const { data: lowStockData } = useQuery({
        queryKey: ["low-stock-count"],
        queryFn: () => api.inventory.lowStockCount(),
        enabled: isManagerOrOwner,
        refetchInterval: 60_000,
    });
    const lowStockCount = lowStockData?.count ?? 0;
    const nav = (to) => () => {
        const paths = { floor: "/floor", kds: "/kds", manager: "/manager", inventory: "/inventory" };
        navigate({ to: paths[to] });
    };
    return (_jsxs("div", { style: {
            height: 64, flexShrink: 0,
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-line)",
            display: "flex", alignItems: "center",
            padding: "0 20px", gap: 20,
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [_jsx("div", { style: {
                            width: 32, height: 32, borderRadius: 8,
                            background: "var(--color-ink)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "var(--color-bg)",
                        }, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" }) }) }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: "var(--color-ink)" }, children: outletName }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: "Terminal 01" })] })] }), stats && (_jsx("div", { style: {
                    display: "flex", gap: 0, marginLeft: 8,
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 10, padding: 4,
                }, children: [
                    { k: "free", label: "Free", dot: "green", val: stats.free },
                    { k: "open", label: "Open", dot: "amber", val: stats.open },
                    { k: "billed", label: "Billed", dot: "red", val: stats.billed },
                ].map((s, i, arr) => (_jsxs("div", { style: {
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 12px",
                        borderRight: i < arr.length - 1 ? "1px solid var(--color-line)" : "none",
                        fontSize: 12,
                    }, children: [_jsx("span", { className: `dot ${s.dot}` }), _jsx("span", { style: { color: "var(--color-ink-3)" }, children: s.label }), _jsx("span", { style: { fontWeight: 600, fontFamily: "var(--font-mono)" }, children: s.val })] }, s.k))) })), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { style: { display: "flex", gap: 4, alignItems: "center" }, children: [onTakeaway && (_jsxs("button", { onClick: onTakeaway, style: { background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "8px 14px", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }, children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z" }), _jsx("path", { d: "M8 8V6a4 4 0 018 0v2" }), _jsx("path", { d: "M9 13h6" })] }), "Takeaway"] })), onDelivery && (_jsxs("button", { onClick: onDelivery, style: { background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "8px 14px", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }, children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M5 8h14M8 8V6a4 4 0 018 0v2" }), _jsx("rect", { x: "2", y: "8", width: "20", height: "12", rx: "2" }), _jsx("path", { d: "M12 12v4M10 14h4" })] }), "Delivery"] })), ["floor", "kds", "manager", "inventory"]
                        .filter((id) => id !== "manager" || isManagerOrOwner)
                        .filter((id) => id !== "inventory" || isManagerOrOwner)
                        .filter((id) => id !== "floor" || user?.role !== "kitchen")
                        .filter((id) => id !== "kds" || user?.role !== "kitchen")
                        .map((id) => {
                        const labels = { floor: "Floor", kds: "Kitchen", manager: "Manager", inventory: "Inventory" };
                        const icons = {
                            floor: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] }),
                            kds: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2" }), _jsx("path", { d: "M3 8h18M7 12h4M7 14h7" }), _jsx("path", { d: "M9 17v3M15 17v3M6 20h12" })] }),
                            manager: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "3" }), _jsx("path", { d: "M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.8a7 7 0 00-2-1.2L14 3h-4l-.6 2.5a7 7 0 00-2 1.2L5.1 5.9l-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.8a7 7 0 002 1.2L10 21h4l.6-2.5a7 7 0 002-1.2l2.3.8 2-3.4-2-1.5c0-.4.1-.8.1-1.2z" })] }),
                            inventory: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M21 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v2" }), _jsx("path", { d: "M3 8h18v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" }), _jsx("path", { d: "M10 12h4M10 16h4M8 12v.01M8 16v.01" })] }),
                        };
                        const active = current === id;
                        return (_jsxs("button", { onClick: nav(id), style: {
                                background: active ? "var(--color-surface-2)" : "transparent",
                                border: "1px solid " + (active ? "var(--color-line)" : "transparent"),
                                color: active ? "var(--color-ink)" : "var(--color-ink-3)",
                                borderRadius: 10, padding: "8px 12px",
                                display: "flex", alignItems: "center", gap: 7,
                                fontSize: 13, fontWeight: 500,
                                transition: "all .1s",
                                position: "relative",
                            }, children: [icons[id], labels[id], id === "inventory" && lowStockCount > 0 && (_jsx("span", { style: { background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px", lineHeight: 1.4 }, children: lowStockCount }))] }, id));
                    })] }), _jsxs("div", { style: {
                    display: "flex", alignItems: "center", gap: 10,
                    paddingLeft: 16, borderLeft: "1px solid var(--color-line)",
                }, children: [_jsx("div", { style: {
                            width: 32, height: 32, borderRadius: "50%",
                            background: "var(--color-accent-soft)", color: "var(--color-accent-ink)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 600,
                        }, children: initials(user?.name ?? "?") }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, lineHeight: 1.1, color: "var(--color-ink)" }, children: user?.name }), _jsx("div", { style: { fontSize: 10, color: "var(--color-ink-3)", textTransform: "capitalize" }, children: user?.role })] }), _jsx("button", { onClick: () => { logout(); navigate({ to: "/login" }); }, title: "Logout", style: {
                            background: "transparent", border: "none",
                            color: "var(--color-ink-3)",
                            width: 32, height: 32, borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all .1s",
                        }, onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.color = "var(--color-ink)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-ink-3)"; }, children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" }) }) })] })] }));
}
