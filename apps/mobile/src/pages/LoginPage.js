import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
const OUTLET_ID_KEY = "inbill_outlet_id";
const OUTLET_NAME_KEY = "inbill_outlet_name";
function PinDots({ length }) {
    return (_jsx("div", { style: { display: "flex", gap: 12, justifyContent: "center", marginBottom: 32 }, children: [0, 1, 2, 3].map((i) => (_jsx("div", { style: {
                width: 14, height: 14, borderRadius: "50%",
                background: i < length ? "var(--color-accent)" : "var(--color-line-strong)",
                transition: "background .12s",
            } }, i))) }));
}
function PinKey({ label, sub, onPress }) {
    return (_jsxs("button", { onPointerDown: (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            el.style.background = "var(--color-surface-2)";
            el.style.transform = "scale(.96)";
            onPress();
        }, onPointerUp: (e) => {
            const el = e.currentTarget;
            el.style.background = "var(--color-surface)";
            el.style.transform = "";
        }, onPointerLeave: (e) => {
            const el = e.currentTarget;
            el.style.background = "var(--color-surface)";
            el.style.transform = "";
        }, style: {
            height: 72, borderRadius: 16,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            fontSize: 26, fontWeight: 500,
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-1)",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
            transition: "transform .08s, background .08s",
            userSelect: "none",
        }, children: [label, sub && _jsx("span", { style: { fontSize: 9, color: "var(--color-ink-4)", fontFamily: "var(--font-sans)", letterSpacing: ".1em", marginTop: 2 }, children: sub })] }));
}
export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const savedOutletId = localStorage.getItem(OUTLET_ID_KEY) ?? "";
    const savedOutletName = localStorage.getItem(OUTLET_NAME_KEY) ?? "InBill";
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const [loading, setLoading] = useState(false);
    // Outlet setup state
    const [setup, setSetup] = useState(!savedOutletId);
    const [outletId, setOutletId] = useState(savedOutletId);
    const [outletName, setOutletName] = useState(savedOutletName);
    const [code, setCode] = useState("");
    const [codeErr, setCodeErr] = useState("");
    const [saving, setSaving] = useState(false);
    // Auto-submit when 4 digits entered
    useEffect(() => {
        if (pin.length === 4)
            void handleLogin(pin);
    }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
    // Hardware keyboard support for PIN
    useEffect(() => {
        if (setup)
            return;
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
            navigate({ to: "/floor" });
        }
        catch (e) {
            const msg = e instanceof ApiError && e.status === 401 ? "Incorrect PIN" : "Login failed";
            setError(msg);
            setPin("");
            setShake(true);
            setTimeout(() => setShake(false), 500);
        }
        finally {
            setLoading(false);
        }
    }
    function press(d) {
        if (pin.length < 4 && !loading) {
            setError("");
            setPin((p) => p + d);
        }
    }
    function back() {
        setPin((p) => p.slice(0, -1));
        setError("");
    }
    async function resolveCode() {
        if (!code.trim())
            return;
        setSaving(true);
        setCodeErr("");
        try {
            const outlet = await api.auth.resolveSetupCode(code.trim());
            localStorage.setItem(OUTLET_ID_KEY, outlet.id);
            localStorage.setItem(OUTLET_NAME_KEY, outlet.name);
            setOutletId(outlet.id);
            setOutletName(outlet.name);
            setSetup(false);
        }
        catch {
            setCodeErr("Invalid setup code");
        }
        finally {
            setSaving(false);
        }
    }
    // ── Outlet setup screen ──────────────────────────────────────────────────
    if (setup) {
        return (_jsxs("div", { style: {
                height: "100dvh", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                padding: "24px 32px", background: "var(--color-bg)",
            }, children: [_jsxs("div", { style: { marginBottom: 32, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 40, marginBottom: 8 }, children: "\uD83C\uDF7D\uFE0F" }), _jsx("h1", { style: { fontSize: 22, fontWeight: 700, marginBottom: 6 }, children: "InBill Captain" }), _jsx("p", { style: { fontSize: 14, color: "var(--color-ink-3)" }, children: "Enter your outlet setup code to get started" })] }), _jsxs("div", { style: { width: "100%", maxWidth: 320 }, children: [_jsx("input", { value: code, onChange: (e) => { setCode(e.target.value.toUpperCase()); setCodeErr(""); }, onKeyDown: (e) => e.key === "Enter" && resolveCode(), placeholder: "Setup code (e.g. ABC-123)", style: {
                                width: "100%", height: 52, borderRadius: 12,
                                border: `1.5px solid ${codeErr ? "var(--color-red)" : "var(--color-line-strong)"}`,
                                padding: "0 16px", fontSize: 16,
                                fontFamily: "var(--font-mono)", letterSpacing: ".08em",
                                background: "var(--color-surface)", color: "var(--color-ink)",
                                outline: "none", marginBottom: codeErr ? 6 : 16,
                            }, autoFocus: true, autoCapitalize: "characters" }), codeErr && (_jsx("p", { style: { fontSize: 13, color: "var(--color-red)", marginBottom: 16, textAlign: "center" }, children: codeErr })), _jsx("button", { className: "btn primary full lg", onClick: resolveCode, disabled: !code.trim() || saving, children: saving ? "Connecting…" : "Connect Outlet" })] })] }));
    }
    // ── PIN pad ───────────────────────────────────────────────────────────────
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    return (_jsxs("div", { style: {
            height: "100dvh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "24px 24px calc(24px + var(--safe-bottom))",
            background: "var(--color-bg)",
        }, children: [_jsxs("div", { style: { textAlign: "center", marginBottom: 40 }, children: [_jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginBottom: 4 }, children: outletName }), _jsx("h2", { style: { fontSize: 20, fontWeight: 600 }, children: "Enter PIN" })] }), _jsx("div", { className: shake ? "animate-shake" : "", children: _jsx(PinDots, { length: pin.length }) }), error && (_jsx("p", { style: {
                    fontSize: 13, color: "var(--color-red)",
                    marginBottom: 16, textAlign: "center",
                    minHeight: 20,
                }, children: error })), _jsxs("div", { style: {
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10, width: "100%", maxWidth: 280,
                    marginTop: error ? 0 : 16,
                }, children: [keys.map((k) => (_jsx(PinKey, { label: k, onPress: () => press(k) }, k))), _jsx("button", { onPointerDown: (e) => { e.preventDefault(); setSetup(true); setPin(""); setError(""); }, style: {
                            height: 72, borderRadius: 16, border: "none", background: "transparent",
                            fontSize: 12, color: "var(--color-ink-3)", cursor: "pointer",
                            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                        }, children: "Change outlet" }), _jsx(PinKey, { label: "0", onPress: () => press("0") }), _jsx("button", { onPointerDown: (e) => { e.preventDefault(); back(); }, style: {
                            height: 72, borderRadius: 16,
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-line)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                        }, children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-ink-3)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21 12H3M9 6l-6 6 6 6" }) }) })] }), loading && (_jsx("p", { style: { marginTop: 24, fontSize: 13, color: "var(--color-ink-3)" }, children: "Signing in\u2026" }))] }));
}
