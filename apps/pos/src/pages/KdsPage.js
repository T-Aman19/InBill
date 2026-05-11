import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
function KDSColumn({ title, accent, kots, actionLabel, onAction, now, stage, }) {
    return (_jsxs("div", { style: {
            background: "var(--color-kds-bg)",
            display: "flex", flexDirection: "column", overflow: "hidden",
        }, children: [_jsxs("div", { style: {
                    padding: "16px 24px",
                    borderBottom: `2px solid ${accent}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("span", { style: { width: 10, height: 10, borderRadius: "50%", background: accent } }), _jsx("h3", { style: { margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: ".01em", textTransform: "uppercase", color: "var(--color-kds-ink)" }, children: title })] }), _jsx("span", { style: { fontSize: 24, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-kds-ink)" }, children: kots.length })] }), _jsxs("div", { className: "scroll", style: { flex: 1, padding: 16, overflowY: "auto" }, children: [kots.length === 0 && (_jsx("div", { style: { textAlign: "center", padding: 80, color: "var(--color-kds-ink-3)", fontSize: 16 }, children: "All clear" })), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }, children: kots.map((kot) => {
                            const elapsed = Math.floor((now - new Date(kot.createdAt).getTime()) / 60000);
                            const overdue = elapsed >= 10;
                            return (_jsxs("div", { style: {
                                    background: "oklch(20% 0.012 60)",
                                    border: `1px solid ${overdue ? "oklch(64% 0.21 25)" : "oklch(30% 0.012 60)"}`,
                                    borderRadius: 12, overflow: "hidden",
                                    display: "flex", flexDirection: "column",
                                }, children: [_jsxs("div", { style: {
                                            padding: "14px 18px",
                                            background: overdue ? "oklch(28% 0.08 25)" : "oklch(24% 0.012 60)",
                                            borderBottom: "1px solid oklch(30% 0.012 60)",
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                        }, children: [_jsx("div", { children: _jsxs("div", { style: { fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: ".02em", color: "var(--color-kds-ink)" }, children: ["KOT #", kot.kotNumber] }) }), _jsxs("div", { style: { textAlign: "right" }, children: [_jsxs("div", { style: {
                                                            fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)",
                                                            color: overdue ? "oklch(72% 0.18 25)" : "var(--color-kds-ink)",
                                                        }, children: [elapsed, "m"] }), _jsx("div", { style: { fontSize: 10, color: overdue ? "oklch(72% 0.18 25)" : "var(--color-kds-ink-3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }, children: overdue ? "⚠ Overdue" : "elapsed" })] })] }), _jsx("div", { style: { padding: 18, flex: 1 }, children: kot.items.map((item, i) => (_jsxs("div", { style: {
                                                padding: "7px 0", fontSize: 18, fontWeight: 500,
                                                borderBottom: i < kot.items.length - 1 ? "1px solid oklch(24% 0.012 60)" : "none",
                                            }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [_jsxs("span", { style: { color: "var(--color-kds-ink)" }, children: [item.name, item.variantName && (_jsxs("span", { style: { fontSize: 13, color: "var(--color-kds-ink-2)", marginLeft: 6 }, children: ["(", item.variantName, ")"] }))] }), _jsxs("span", { style: { fontFamily: "var(--font-mono)", color: accent, fontSize: 20, fontWeight: 700, marginLeft: 12 }, children: ["\u00D7", item.quantity] })] }), item.modifiers && item.modifiers.length > 0 && (_jsx("div", { style: { marginTop: 4, paddingLeft: 12 }, children: item.modifiers.map((m, mi) => (_jsxs("div", { style: { fontSize: 13, color: "var(--color-kds-ink-2)", lineHeight: 1.5 }, children: ["+ ", m.name] }, mi))) })), item.notes && (_jsxs("div", { style: { marginTop: 4, paddingLeft: 12, fontSize: 13, color: "oklch(70% 0.15 70)", fontStyle: "italic" }, children: ["Note: ", item.notes] }))] }, item.id))) }), _jsxs("button", { onClick: () => onAction(kot.id), style: {
                                            height: 64, background: accent,
                                            border: "none",
                                            color: stage === "new" ? "oklch(20% 0.04 25)" : "oklch(20% 0.04 70)",
                                            fontSize: 17, fontWeight: 700, fontFamily: "inherit",
                                            cursor: "pointer", letterSpacing: ".02em",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                        }, children: [stage === "new"
                                                ? _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "currentColor", stroke: "none", children: _jsx("path", { d: "M6 4l14 8-14 8z" }) })
                                                : _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }), actionLabel] })] }, kot.id));
                        }) })] })] }));
}
export default function KdsPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [now, setNow] = useState(Date.now());
    // Tick every 30s so elapsed time stays fresh
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);
    const { data: kots = [] } = useQuery({
        queryKey: ["kots"],
        queryFn: () => api.kots.getActive(),
        refetchInterval: 15_000,
    });
    useEffect(() => {
        const invalidate = () => qc.invalidateQueries({ queryKey: ["kots"] });
        const u1 = ws.on("kot.new", invalidate);
        const u2 = ws.on("kot.done", invalidate);
        const u3 = ws.on("kot.acknowledged", invalidate);
        return () => { u1(); u2(); u3(); };
    }, [qc]);
    const ackMutation = useMutation({
        mutationFn: (id) => api.kots.acknowledge(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["kots"] }),
    });
    const doneMutation = useMutation({
        mutationFn: (id) => api.kots.done(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["kots"] }),
    });
    const newKots = kots.filter((k) => k.status === "pending");
    const progKots = kots.filter((k) => k.status === "acknowledged");
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-kds-bg)", color: "var(--color-kds-ink)" }, children: [_jsxs("div", { style: {
                    height: 64, flexShrink: 0,
                    background: "var(--color-kds-bar)",
                    borderBottom: "1px solid var(--color-kds-line)",
                    display: "flex", alignItems: "center",
                    padding: "0 24px", gap: 16,
                }, children: [_jsxs("button", { onClick: () => navigate({ to: "/floor" }), style: {
                            background: "transparent",
                            border: "1px solid oklch(34% 0.012 60)",
                            borderRadius: 8, padding: "8px 12px",
                            color: "var(--color-kds-ink)", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                            fontFamily: "inherit",
                        }, children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }), "Back"] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginLeft: 8 }, children: [_jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-kds-ink)" }, children: [_jsx("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2" }), _jsx("path", { d: "M3 8h18M7 12h4M7 14h7" }), _jsx("path", { d: "M9 17v3M15 17v3M6 20h12" })] }), _jsx("span", { style: { fontSize: 18, fontWeight: 600, letterSpacing: "-.01em" }, children: "Kitchen Display" })] }), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { style: { display: "flex", gap: 20, fontSize: 13, color: "var(--color-kds-ink-2)" }, children: [_jsxs("span", { children: [_jsx("b", { style: { color: "var(--color-kds-ink)" }, children: newKots.length }), " new"] }), _jsxs("span", { children: [_jsx("b", { style: { color: "var(--color-kds-ink)" }, children: progKots.length }), " in progress"] }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: new Date(now).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) })] })] }), _jsxs("div", { style: {
                    flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr",
                    gap: 1, background: "oklch(28% 0.012 60)",
                    overflow: "hidden",
                }, children: [_jsx(KDSColumn, { title: "New Orders", accent: "oklch(64% 0.21 25)", kots: newKots, stage: "new", actionLabel: "Accept", onAction: (id) => ackMutation.mutate(id), now: now }), _jsx(KDSColumn, { title: "In Progress", accent: "oklch(76% 0.16 70)", kots: progKots, stage: "progress", actionLabel: "Done", onAction: (id) => doneMutation.mutate(id), now: now })] })] }));
}
