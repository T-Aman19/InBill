import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
const OUTLET_ID_KEY = "inbill_outlet_id";
const OUTLET_NAME_KEY = "inbill_outlet_name";
export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const [outletId, setOutletId] = useState(localStorage.getItem(OUTLET_ID_KEY) ?? "");
    const [outletName, setOutletName] = useState(localStorage.getItem(OUTLET_NAME_KEY) ?? "InBill POS");
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const [loading, setLoading] = useState(false);
    const [setup, setSetup] = useState(!localStorage.getItem(OUTLET_ID_KEY));
    const [tmpId, setTmpId] = useState("");
    const [tmpName, setTmpName] = useState("");
    // Auto-submit on 4th digit
    useEffect(() => {
        if (pin.length === 4)
            void handleLogin(pin);
    }, [pin]);
    // Hardware keyboard support
    useEffect(() => {
        const onKey = (e) => {
            if (/^[0-9]$/.test(e.key))
                press(e.key);
            else if (e.key === "Backspace")
                back();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
    async function handleLogin(p) {
        if (!outletId)
            return;
        setLoading(true);
        try {
            const res = await api.auth.login(p, outletId);
            login(res.token, res.user, outletId, outletName);
            navigate({ to: res.user.role === "kitchen" ? "/kds" : "/floor" });
        }
        catch (e) {
            const msg = e instanceof ApiError && e.status === 401 ? "Incorrect PIN" : "Login failed";
            setError(msg);
            setPin("");
            setShake(true);
            setTimeout(() => { setShake(false); setError(""); }, 1200);
        }
        finally {
            setLoading(false);
        }
    }
    function press(d) {
        if (loading || pin.length >= 4)
            return;
        setError("");
        setPin((p) => p + d);
    }
    function back() { setPin((p) => p.slice(0, -1)); setError(""); }
    function clear() { setPin(""); setError(""); }
    function saveOutlet() {
        if (!tmpId.trim())
            return;
        const id = tmpId.trim();
        const name = tmpName.trim() || "InBill POS";
        localStorage.setItem(OUTLET_ID_KEY, id);
        localStorage.setItem(OUTLET_NAME_KEY, name);
        setOutletId(id);
        setOutletName(name);
        setSetup(false);
    }
    // ── Setup screen ────────────────────────────────────────────
    if (setup)
        return (_jsx("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }, children: _jsxs("div", { style: { width: 420, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 32, boxShadow: "var(--shadow-2)" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }, children: [_jsx("div", { style: { width: 36, height: 36, borderRadius: 10, background: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-bg)" }, children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" }) }) }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "Setup InBill" }), _jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: "Connect to your outlet" })] })] }), [
                        { label: "Outlet Name", value: tmpName, set: setTmpName, placeholder: "e.g. Saffron Kitchen", mono: false },
                        { label: "Outlet ID", value: tmpId, set: setTmpId, placeholder: "xxxxxxxx-xxxx-…", mono: true },
                    ].map(({ label, value, set, placeholder, mono }) => (_jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("label", { style: { display: "block", fontSize: 11, fontWeight: 500, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }, children: label }), _jsx("input", { value: value, onChange: (e) => set(e.target.value), placeholder: placeholder, style: {
                                    width: "100%", height: 44, padding: "0 14px",
                                    border: "1px solid var(--color-line-strong)", borderRadius: 10,
                                    background: "var(--color-bg)", color: "var(--color-ink)",
                                    fontSize: mono ? 12 : 14, fontFamily: mono ? "var(--font-mono)" : "inherit",
                                    outline: "none",
                                }, onFocus: (e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)"), onBlur: (e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)") })] }, label))), _jsxs("p", { style: { fontSize: 11, color: "var(--color-ink-3)", marginBottom: 20 }, children: ["Outlet ID is printed when you run ", _jsx("code", { style: { fontFamily: "var(--font-mono)", background: "var(--color-surface-2)", padding: "1px 5px", borderRadius: 4 }, children: "bun run db:seed" })] }), _jsxs("button", { onClick: saveOutlet, disabled: !tmpId.trim(), style: {
                            width: "100%", height: 48,
                            background: "var(--color-ink)", border: "none",
                            color: "var(--color-bg)", borderRadius: 12,
                            fontSize: 14, fontWeight: 600, fontFamily: "inherit",
                            cursor: tmpId.trim() ? "pointer" : "not-allowed",
                            opacity: tmpId.trim() ? 1 : .4,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }, children: ["Continue", _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })] })] }) }));
    // ── Main login ───────────────────────────────────────────────
    const Key = ({ d, sub }) => (_jsxs("button", { onClick: () => press(d), disabled: loading || pin.length >= 4, style: {
            height: 76,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            borderRadius: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 28, fontWeight: 500,
            color: "var(--color-ink)",
            cursor: "pointer",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-1)",
            transition: "all .08s",
            userSelect: "none",
        }, onMouseDown: (e) => { e.currentTarget.style.background = "var(--color-surface-2)"; e.currentTarget.style.transform = "translateY(1px)"; }, onMouseUp: (e) => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.transform = ""; }, onMouseLeave: (e) => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.transform = ""; }, children: [d, sub && _jsx("span", { style: { fontSize: 9, color: "var(--color-ink-4)", fontFamily: "var(--font-sans)", letterSpacing: ".1em", marginTop: 2 }, children: sub })] }));
    return (_jsxs("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr", overflow: "hidden" }, children: [_jsxs("div", { style: {
                    background: "linear-gradient(160deg, oklch(28% 0.04 55), oklch(22% 0.02 55))",
                    color: "oklch(96% 0.02 70)",
                    display: "flex", flexDirection: "column",
                    padding: "48px 56px",
                    position: "relative", overflow: "hidden",
                }, children: [_jsx("div", { style: { position: "absolute", inset: 0, opacity: .12, pointerEvents: "none",
                            backgroundImage: "radial-gradient(circle at 20% 90%, oklch(70% 0.15 55) 0, transparent 40%), radial-gradient(circle at 90% 10%, oklch(70% 0.15 55) 0, transparent 50%)" } }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, position: "relative" }, children: [_jsx("div", { style: { width: 36, height: 36, borderRadius: 10, background: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(20% 0.05 55)" }, children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" }) }) }), _jsx("span", { style: { fontSize: 18, fontWeight: 600, letterSpacing: "-.01em" }, children: "InBill" })] }), _jsxs("div", { style: { marginTop: "auto", position: "relative" }, children: [_jsx("div", { style: { fontSize: 13, color: "oklch(72% 0.02 70)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 10 }, children: "Outlet" }), _jsx("div", { style: { fontSize: 36, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-.02em" }, children: outletName }), _jsxs("div", { style: { display: "flex", gap: 24, marginTop: 32, fontSize: 12, color: "oklch(72% 0.02 70)" }, children: [_jsxs("span", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "oklch(70% 0.15 145)" } }), "Local network"] }), _jsx("span", { children: "Terminal 01" }), _jsx("span", { children: "v1.0.0" })] })] })] }), _jsx("div", { style: {
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: 40,
                    background: "var(--color-bg)",
                }, children: _jsxs("div", { className: shake ? "animate-shake" : "", style: { width: 360, display: "flex", flexDirection: "column", alignItems: "center" }, children: [_jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 500 }, children: "Welcome back" }), _jsx("div", { style: { fontSize: 22, fontWeight: 600, marginTop: 8, color: "var(--color-ink)" }, children: "Enter your PIN" }), _jsx("div", { style: { display: "flex", gap: 16, marginTop: 28, marginBottom: 8, alignItems: "center" }, children: [0, 1, 2, 3].map((i) => (_jsx("div", { style: {
                                    width: 16, height: 16, borderRadius: "50%",
                                    background: pin.length > i ? (error ? "var(--color-red)" : "var(--color-ink)") : "transparent",
                                    border: "2px solid " + (pin.length > i ? (error ? "var(--color-red)" : "var(--color-ink)") : "var(--color-line-strong)"),
                                    transition: "all .15s",
                                } }, i))) }), _jsx("div", { style: { height: 18, fontSize: 12, color: "var(--color-red)", fontWeight: 500 }, children: error }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", marginTop: 16 }, children: [["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => _jsx(Key, { d: d }, d)), _jsx("button", { onClick: clear, style: {
                                        height: 76, background: "transparent",
                                        border: "1px solid var(--color-line)",
                                        borderRadius: 16, fontSize: 12, color: "var(--color-ink-3)",
                                        cursor: "pointer", fontWeight: 500, letterSpacing: ".04em",
                                        fontFamily: "var(--font-sans)",
                                    }, children: "CLEAR" }), _jsx(Key, { d: "0" }), _jsx("button", { onClick: back, style: {
                                        height: 76, background: "transparent",
                                        border: "1px solid var(--color-line)",
                                        borderRadius: 16, cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "var(--color-ink-2)",
                                    }, children: _jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }) })] }), _jsxs("div", { style: { marginTop: 28, display: "flex", justifyContent: "space-between", width: "100%", fontSize: 12, color: "var(--color-ink-3)" }, children: [_jsx("button", { onClick: () => setSetup(true), style: { background: "none", border: "none", color: "var(--color-ink-3)", cursor: "pointer", fontSize: 12, padding: 0 }, children: "Change outlet" }), loading && _jsx("span", { children: "Checking\u2026" })] })] }) })] }));
}
