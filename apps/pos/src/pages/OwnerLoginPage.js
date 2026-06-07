import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/lib/api";
export default function OwnerLoginPage() {
    const navigate = useNavigate();
    const [tab, setTab] = useState("login");
    const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    function set(k) {
        return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    }
    async function submit(e) {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            const res = tab === "login"
                ? await api.owner.login(form.email, form.password)
                : await api.owner.register(form);
            localStorage.setItem("inbill_owner_token", res.token);
            navigate({ to: "/owner/dashboard" });
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : "Something went wrong");
        }
        finally {
            setLoading(false);
        }
    }
    const inputStyle = {
        width: "100%",
        height: 42,
        border: "1px solid var(--color-line-strong)",
        borderRadius: 10,
        padding: "0 14px",
        fontSize: 14,
        fontFamily: "var(--font-sans)",
        outline: "none",
        boxSizing: "border-box",
        color: "var(--color-ink)",
        background: "var(--color-surface)",
    };
    const labelStyle = {
        display: "block",
        fontSize: 12,
        fontWeight: 500,
        color: "var(--color-ink-2)",
        marginBottom: 5,
    };
    return (_jsx("div", { style: { minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }, children: _jsxs("div", { style: { width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { width: 28, height: 28, background: "var(--color-ink)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "white", children: _jsx("path", { d: "M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" }) }) }), _jsx("span", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "InBill Owner" })] }), _jsxs("div", { style: { width: "100%", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "var(--shadow-2)" }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--color-surface-2)", padding: 3, borderRadius: 10, marginBottom: 24, position: "relative" }, children: [_jsx("div", { style: {
                                        position: "absolute",
                                        top: 3,
                                        left: tab === "login" ? 3 : "calc(50% + 0px)",
                                        width: "calc(50% - 3px)",
                                        height: "calc(100% - 6px)",
                                        background: "var(--color-surface)",
                                        borderRadius: 8,
                                        boxShadow: "0 1px 4px rgba(0,0,0,.08)",
                                        transition: "left 0.18s ease",
                                    } }), ["login", "register"].map((t) => (_jsx("button", { onClick: () => { setTab(t); setErr(""); }, style: {
                                        position: "relative",
                                        zIndex: 1,
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        padding: "7px 0",
                                        fontSize: 13,
                                        fontWeight: tab === t ? 600 : 500,
                                        color: tab === t ? "var(--color-ink)" : "var(--color-ink-3)",
                                        transition: "color 0.18s ease",
                                        fontFamily: "var(--font-sans)",
                                    }, children: t === "login" ? "Sign In" : "Create Account" }, t)))] }), _jsxs("div", { style: { marginBottom: 4 }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 600, color: "var(--color-ink)" }, children: tab === "login" ? "Welcome back" : "Create account" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 4 }, children: tab === "login" ? "Sign in to manage your outlets." : "Get started with InBill Owner." })] }), _jsxs("form", { onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }, children: [tab === "register" && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Name" }), _jsx("input", { style: inputStyle, placeholder: "Your name", value: form.name, onChange: set("name"), required: true })] }), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Phone" }), _jsx("input", { style: inputStyle, placeholder: "10-digit mobile number", value: form.phone, onChange: set("phone"), required: true })] })] })), _jsxs("div", { children: [_jsx("label", { style: labelStyle, children: "Email" }), _jsx("input", { type: "email", style: inputStyle, placeholder: "you@example.com", value: form.email, onChange: set("email"), required: true })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }, children: [_jsx("label", { style: { ...labelStyle, marginBottom: 0 }, children: "Password" }), tab === "login" && (_jsx("button", { type: "button", onClick: () => navigate({ to: "/owner/forgot-password" }), style: { fontSize: 12, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }, children: "Forgot password?" }))] }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("input", { type: showPassword ? "text" : "password", style: { ...inputStyle, paddingRight: 42 }, placeholder: "Min 8 characters", value: form.password, onChange: set("password"), required: true }), _jsx("button", { type: "button", onClick: () => setShowPassword((v) => !v), style: {
                                                        position: "absolute",
                                                        right: 12,
                                                        top: "50%",
                                                        transform: "translateY(-50%)",
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                        color: "var(--color-ink-3)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                    }, tabIndex: -1, children: showPassword ? (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" }), _jsx("line", { x1: "1", y1: "1", x2: "23", y2: "23" })] })) : (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] })) })] })] }), err && _jsx("p", { style: { fontSize: 13, color: "var(--color-red)", margin: 0 }, children: err }), _jsxs("button", { type: "submit", className: "btn primary", disabled: loading, style: { width: "100%", height: 44, justifyContent: "center", fontSize: 14, marginTop: 4, gap: 8 }, children: [loading ? "Please wait…" : tab === "login" ? "Sign in" : "Create Account", !loading && (_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" }), _jsx("polyline", { points: "12 5 19 12 12 19" })] }))] })] }), _jsx("div", { style: { borderTop: "1px solid var(--color-line)", paddingTop: 18, marginTop: 20, textAlign: "center" }, children: _jsxs("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: ["Staff member?", " ", _jsx("button", { type: "button", onClick: () => navigate({ to: "/login" }), style: { fontSize: 12, color: "var(--color-accent)", fontWeight: 500, textDecoration: "none", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }, children: "Go to POS login \u2192" })] }) })] }), _jsx("p", { style: { fontSize: 11, color: "var(--color-ink-3)", textAlign: "center", margin: 0 }, children: "By continuing you agree to InBill's Terms and Privacy Policy" })] }) }));
}
