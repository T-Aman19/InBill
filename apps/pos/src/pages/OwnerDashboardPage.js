import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
const DEFAULT_CREATE = { name: "", address: "", phone: "", gstin: "", timezone: "Asia/Kolkata" };
const RANGE_LABELS = { today: "Today", week: "This Week", month: "This Month" };
function getRangeDates(range) {
    if (range === "today")
        return undefined;
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (range === "week") {
        const from = new Date(today);
        from.setDate(today.getDate() - 6);
        return { from: fmt(from), to: fmt(today) };
    }
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(from), to: fmt(today) };
}
export default function OwnerDashboardPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(DEFAULT_CREATE);
    const [createErr, setCreateErr] = useState("");
    const [range, setRange] = useState("today");
    useEffect(() => {
        if (!localStorage.getItem("inbill_owner_token"))
            navigate({ to: "/owner/login" });
    }, [navigate]);
    const dates = getRangeDates(range);
    const { data: outlets = [], isLoading, error } = useQuery({
        queryKey: ["owner-outlets", range],
        queryFn: () => api.owner.outlets(dates?.from, dates?.to),
        refetchInterval: 30_000,
    });
    const createMutation = useMutation({
        mutationFn: (body) => api.owner.createOutlet(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["owner-outlets"] });
            setShowCreate(false);
            setCreateForm(DEFAULT_CREATE);
        },
        onError: (e) => setCreateErr(e.message),
    });
    const switchMutation = useMutation({
        mutationFn: (outletId) => api.owner.switchOutlet(outletId),
        onSuccess: (res, outletId) => {
            localStorage.setItem("inbill_outlet_id", res.outlet.id);
            localStorage.setItem("inbill_outlet_name", res.outlet.name);
            useAuthStore.getState().login(res.token, res.user, res.outlet.id, res.outlet.name);
            const outlet = outlets.find((o) => o.id === outletId);
            const needsSetup = !outlet?.tableCount || !outlet?.menuItemCount;
            if (needsSetup) {
                localStorage.removeItem("inbill_setup_dismissed");
                navigate({ to: "/manager" });
            }
            else {
                navigate({ to: "/floor" });
            }
        },
    });
    const quickActionMutation = useMutation({
        mutationFn: ({ outletId }) => api.owner.switchOutlet(outletId),
        onSuccess: (res, { tab }) => {
            localStorage.setItem("inbill_outlet_id", res.outlet.id);
            localStorage.setItem("inbill_outlet_name", res.outlet.name);
            useAuthStore.getState().login(res.token, res.user, res.outlet.id, res.outlet.name);
            if (tab === "inventory") {
                navigate({ to: "/inventory" });
            }
            else {
                navigate({ to: "/manager", search: { tab } });
            }
        },
    });
    function handleCreate(e) {
        e.preventDefault();
        setCreateErr("");
        createMutation.mutate(createForm);
    }
    function logout() {
        localStorage.removeItem("inbill_owner_token");
        navigate({ to: "/owner/login" });
    }
    function fmt(n) {
        return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
    }
    const outletList = outlets;
    const totalRevenue = outletList.reduce((s, o) => s + o.revenue, 0);
    const totalBills = outletList.reduce((s, o) => s + o.billCount, 0);
    const totalOpen = outletList.reduce((s, o) => s + o.openOrderCount, 0);
    const avgTicket = totalBills > 0 ? Math.round(totalRevenue / totalBills) : 0;
    const unpaidOutlets = outletList.filter((o) => !o.upiVpa && !o.razorpayConfigured);
    const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
    const ownerInitials = (() => {
        try {
            const token = localStorage.getItem("inbill_owner_token") || "";
            const payload = JSON.parse(atob(token.split(".")[1] || btoa("{}")));
            const name = payload.name || payload.email || "O";
            return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        }
        catch {
            return "O";
        }
    })();
    if (isLoading) {
        return (_jsx("div", { style: { minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }, children: _jsx("p", { style: { color: "var(--color-ink-3)" }, children: "Loading\u2026" }) }));
    }
    if (error) {
        return (_jsx("div", { style: { minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }, children: _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("p", { style: { color: "var(--color-red)", marginBottom: 16 }, children: error.message }), _jsx("button", { onClick: logout, style: { fontSize: 13, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer" }, children: "Sign out" })] }) }));
    }
    const statPills = [
        { k: "Revenue", v: fmt(totalRevenue), sub: RANGE_LABELS[range].toLowerCase(), tone: "green" },
        { k: "Bills", v: String(totalBills), sub: RANGE_LABELS[range].toLowerCase(), tone: "neutral" },
        { k: "Open orders", v: String(totalOpen), sub: totalOpen > 0 ? "needs attention" : "all clear", tone: totalOpen > 0 ? "amber" : "neutral" },
        { k: "Avg ticket", v: avgTicket > 0 ? fmt(avgTicket) : "—", sub: RANGE_LABELS[range].toLowerCase(), tone: "neutral" },
    ];
    const PAYMENT_MODE_LABEL = { cash: "Cash", upi: "UPI", card: "Card", razorpay: "Razorpay" };
    const quickActions = [
        {
            label: "Menu", tab: "menu",
            icon: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" }) }),
        },
        {
            label: "Staff", tab: "staff",
            icon: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" }), _jsx("circle", { cx: "9", cy: "7", r: "4" }), _jsx("path", { d: "M23 21v-2a4 4 0 00-3-3.87" }), _jsx("path", { d: "M16 3.13a4 4 0 010 7.75" })] }),
        },
        {
            label: "Reports", tab: "shifts",
            icon: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "18", y1: "20", x2: "18", y2: "10" }), _jsx("line", { x1: "12", y1: "20", x2: "12", y2: "4" }), _jsx("line", { x1: "6", y1: "20", x2: "6", y2: "14" })] }),
        },
        {
            label: "Inventory", tab: "inventory",
            icon: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" }), _jsx("polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }), _jsx("line", { x1: "12", y1: "22.08", x2: "12", y2: "12" })] }),
        },
    ];
    const firstOutlet = outletList[0];
    return (_jsxs("div", { style: { minHeight: "100vh", background: "var(--color-bg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }, children: [_jsxs("header", { style: { height: 64, background: "#fff", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 28px", gap: 12, flexShrink: 0 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { width: 28, height: 28, background: "var(--color-ink)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }, children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "white", children: _jsx("path", { d: "M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" }) }) }), _jsx("span", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "InBill Owner" })] }), _jsx("div", { style: { flex: 1 } }), _jsx("span", { style: { fontSize: 13, color: "var(--color-ink-3)" }, children: dateStr }), _jsx("button", { className: "btn primary", onClick: () => setShowCreate(true), style: { fontSize: 13, padding: "0 16px", height: 34 }, children: "+ Add outlet" }), _jsx("div", { style: { width: 1, height: 22, background: "var(--color-line)", margin: "0 4px" } }), _jsx("div", { style: { width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }, children: ownerInitials }), _jsx("button", { className: "btn ghost", onClick: logout, title: "Sign out", style: { padding: "0 8px", height: 34, display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" }), _jsx("polyline", { points: "16 17 21 12 16 7" }), _jsx("line", { x1: "21", y1: "12", x2: "9", y2: "12" })] }) })] }), _jsxs("main", { style: { padding: 32, overflow: "auto", flex: 1 }, children: [outletList.length > 0 && (_jsx("div", { style: { display: "flex", gap: 4, marginBottom: 16 }, children: ["today", "week", "month"].map((r) => (_jsx("button", { onClick: () => setRange(r), style: {
                                fontSize: 12,
                                fontWeight: range === r ? 600 : 400,
                                padding: "5px 14px",
                                borderRadius: 9999,
                                border: range === r ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                                background: range === r ? "var(--color-ink)" : "transparent",
                                color: range === r ? "#fff" : "var(--color-ink-3)",
                                cursor: "pointer",
                                transition: "all 0.12s",
                            }, children: RANGE_LABELS[r] }, r))) })), _jsx("div", { style: { display: "flex", gap: 10, marginBottom: outletList.length > 0 && unpaidOutlets.length > 0 ? 12 : 28, flexWrap: "wrap" }, children: statPills.map((pill) => (_jsxs("div", { style: {
                                borderRadius: 9999,
                                border: "1px solid var(--color-line)",
                                background: "#fff",
                                padding: "10px 20px",
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                            }, children: [_jsx("span", { style: { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-ink-3)" }, children: pill.k }), _jsx("span", { style: { fontSize: 17, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }, children: pill.v }), _jsx("span", { style: {
                                        fontSize: 11,
                                        color: pill.tone === "green" ? "var(--color-green)" : pill.tone === "amber" ? "var(--color-amber)" : "var(--color-ink-3)",
                                    }, children: pill.sub })] }, pill.k))) }), outletList.length > 0 && unpaidOutlets.length > 0 && (_jsx("div", { style: { marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "var(--color-amber-soft, #fff8e1)", border: "1px solid var(--color-amber, #f59e0b)", fontSize: 12 }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-amber, #f59e0b)", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" }), _jsx("line", { x1: "12", y1: "9", x2: "12", y2: "13" }), _jsx("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })] }), _jsx("span", { style: { color: "var(--color-amber-dark, #92400e)", fontWeight: 500 }, children: unpaidOutlets.length === 1
                                        ? `"${unpaidOutlets[0]?.name}" has no payment method configured`
                                        : `${unpaidOutlets.length} outlets have no payment method configured` })] }) })), _jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: 16, gap: 12 }, children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 600, color: "var(--color-ink)", margin: 0 }, children: "Outlets" }), _jsx("div", { style: { flex: 1 } }), outletList.length > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "dot green" }), _jsx("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: "All systems operational" })] }))] }), outletList.length === 0 ? (_jsxs("div", { style: { maxWidth: 560, margin: "0 auto", paddingTop: 48 }, children: [_jsxs("div", { style: { textAlign: "center", marginBottom: 40 }, children: [_jsx("div", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: "var(--color-accent)", marginBottom: 18 }, children: _jsx("svg", { width: "30", height: "30", viewBox: "0 0 24 24", fill: "white", children: _jsx("path", { d: "M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" }) }) }), _jsx("h2", { style: { fontSize: 22, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 8px" }, children: "Welcome to InBill" }), _jsx("p", { style: { fontSize: 14, color: "var(--color-ink-3)", margin: 0 }, children: "Set up your restaurant in 3 quick steps and you'll be taking orders in minutes." })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }, children: [
                                    { step: 1, title: "Create your outlet", desc: "Add your restaurant's name, address, and contact details.", action: true },
                                    { step: 2, title: "Set up your menu", desc: "Add categories and menu items inside the POS Manager.", action: false },
                                    { step: 3, title: "Add your staff", desc: "Create PINs for managers, cashiers, captains, and kitchen staff.", action: false },
                                ].map(({ step, title, desc, action }) => (_jsxs("div", { style: {
                                        display: "flex",
                                        gap: 16,
                                        padding: "18px 20px",
                                        borderRadius: 12,
                                        border: `1px solid ${action ? "var(--color-accent-soft)" : "var(--color-line)"}`,
                                        background: action ? "var(--color-accent-soft)" : "#fff",
                                        opacity: action ? 1 : 0.55,
                                    }, children: [_jsx("div", { style: { flexShrink: 0, width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: action ? "var(--color-accent)" : "var(--color-surface-2)", color: action ? "var(--color-accent-ink)" : "var(--color-ink-3)" }, children: step }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: 14, color: "var(--color-ink)", marginBottom: 2 }, children: title }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)" }, children: desc })] })] }, step))) }), _jsx("button", { className: "btn primary", onClick: () => setShowCreate(true), style: { width: "100%", height: 46, fontSize: 15, justifyContent: "center" }, children: "Create your first outlet \u2192" })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 32 }, children: outletList.map((outlet) => {
                                    const paymentEntries = Object.entries(outlet.byPaymentMode).filter(([, amt]) => amt > 0);
                                    return (_jsxs("div", { style: {
                                            background: "#fff",
                                            border: "1px solid var(--color-line)",
                                            borderRadius: 12,
                                            padding: 22,
                                            boxShadow: "var(--shadow-1, 0 1px 4px rgba(0,0,0,.06))",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 14,
                                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 17, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }, children: outlet.name }), _jsxs("span", { style: {
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    gap: 4,
                                                                    background: "var(--color-surface-2)",
                                                                    border: "1px solid var(--color-line)",
                                                                    borderRadius: 9999,
                                                                    padding: "3px 10px",
                                                                    fontSize: 11,
                                                                    color: "var(--color-ink-3)",
                                                                }, children: [_jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" }) }), outlet.address] })] }), outlet.openOrderCount > 0 && (_jsxs("span", { className: "badge amber", style: { display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }, children: [_jsx("span", { className: "dot amber", style: { flexShrink: 0 } }), outlet.openOrderCount, " open"] }))] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-line)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--color-line)" }, children: [_jsxs("div", { style: { background: "#fff", padding: "12px 14px" }, children: [_jsx("div", { style: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-3)", marginBottom: 4 }, children: "Revenue" }), _jsx("div", { style: { fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }, children: fmt(outlet.revenue) })] }), _jsxs("div", { style: { background: "#fff", padding: "12px 14px" }, children: [_jsx("div", { style: { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-3)", marginBottom: 4 }, children: "Bills" }), _jsx("div", { style: { fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }, children: outlet.billCount })] })] }), paymentEntries.length > 0 && (_jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: paymentEntries.map(([mode, amount]) => (_jsxs("span", { style: { fontSize: 11, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 9999, padding: "3px 10px", color: "var(--color-ink-2)" }, children: [PAYMENT_MODE_LABEL[mode] ?? mode, " \u00B7 ", fmt(amount)] }, mode))) })), (outlet.tableCount === 0 || outlet.menuItemCount === 0 || outlet.staffCount === 0) && (_jsxs("div", { style: { display: "flex", gap: 5, flexWrap: "wrap" }, children: [outlet.tableCount === 0 && (_jsx("span", { style: { background: "var(--color-amber-soft, #fff8e1)", color: "var(--color-amber)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-amber-soft, #ffe082)" }, children: "No tables" })), outlet.menuItemCount === 0 && (_jsx("span", { style: { background: "var(--color-amber-soft, #fff8e1)", color: "var(--color-amber)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-amber-soft, #ffe082)" }, children: "No menu" })), outlet.staffCount === 0 && (_jsx("span", { style: { background: "var(--color-surface-2)", color: "var(--color-ink-3)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-line)" }, children: "No staff" }))] })), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, paddingTop: 2, marginTop: "auto" }, children: [outlet.setupCode && (_jsx("span", { title: "Device setup code \u2014 share with staff", style: { fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-ink-3)", letterSpacing: ".08em", border: "1px solid var(--color-line)", borderRadius: 6, padding: "2px 8px" }, children: outlet.setupCode })), outlet.upiVpa && (_jsx("span", { style: { background: "var(--color-blue-soft)", color: "var(--color-blue)", fontSize: 11, borderRadius: 9999, padding: "3px 9px" }, children: "UPI" })), outlet.razorpayConfigured && (_jsx("span", { style: { background: "var(--color-blue-soft)", color: "var(--color-blue)", fontSize: 11, borderRadius: 9999, padding: "3px 9px" }, children: "Razorpay" })), _jsx("div", { style: { flex: 1 } }), outlet.tableCount > 0 && outlet.menuItemCount > 0 ? (_jsx("button", { onClick: () => switchMutation.mutate(outlet.id), disabled: switchMutation.isPending, style: { fontSize: 13, fontWeight: 600, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }, children: "Open POS \u2192" })) : (_jsx("button", { onClick: () => switchMutation.mutate(outlet.id), disabled: switchMutation.isPending, style: { fontSize: 13, fontWeight: 600, color: "var(--color-amber)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }, children: "Finish setup \u2192" }))] })] }, outlet.id));
                                }) }), firstOutlet && (_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }, children: ["Quick access", outletList.length === 1 ? ` · ${firstOutlet.name}` : ""] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }, children: quickActions.map((action) => (_jsxs("button", { onClick: () => quickActionMutation.mutate({ outletId: firstOutlet.id, tab: action.tab }), disabled: quickActionMutation.isPending, style: {
                                                background: "#fff",
                                                border: "1px solid var(--color-line)",
                                                borderRadius: 12,
                                                padding: "18px 16px",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 10,
                                                cursor: "pointer",
                                                transition: "border-color 0.12s, box-shadow 0.12s",
                                            }, onMouseEnter: (e) => {
                                                const el = e.currentTarget;
                                                el.style.borderColor = "var(--color-accent)";
                                                el.style.boxShadow = "0 0 0 3px var(--color-accent-soft)";
                                            }, onMouseLeave: (e) => {
                                                const el = e.currentTarget;
                                                el.style.borderColor = "var(--color-line)";
                                                el.style.boxShadow = "none";
                                            }, children: [_jsx("div", { style: { width: 38, height: 38, borderRadius: 10, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-2)" }, children: action.icon }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)" }, children: action.label })] }, action.label))) }), outletList.length > 1 && (_jsx("p", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 8 }, children: "Opens first outlet. Use outlet cards above to enter a specific location." }))] }))] }))] }), showCreate && (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }, children: _jsxs("div", { style: { background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,.15)", width: "100%", maxWidth: 440, padding: 28 }, children: [_jsx("h2", { style: { fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }, children: "Add Outlet" }), _jsxs("form", { onSubmit: handleCreate, style: { display: "flex", flexDirection: "column", gap: 12 }, children: [["name", "address", "phone", "gstin"].map((field) => (_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5, textTransform: "capitalize" }, children: field === "gstin" ? "GSTIN (optional)" : field }), _jsx("input", { style: { width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)" }, value: createForm[field], onChange: (e) => setCreateForm((f) => ({ ...f, [field]: e.target.value })), required: field !== "gstin" })] }, field))), createErr && _jsx("p", { style: { fontSize: 13, color: "var(--color-red)", margin: 0 }, children: createErr }), _jsxs("div", { style: { display: "flex", gap: 8, paddingTop: 4 }, children: [_jsx("button", { type: "button", className: "btn ghost", onClick: () => setShowCreate(false), style: { flex: 1, justifyContent: "center", height: 40 }, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn primary", disabled: createMutation.isPending, style: { flex: 1, justifyContent: "center", height: 40 }, children: createMutation.isPending ? "Creating…" : "Create" })] })] })] }) }))] }));
}
