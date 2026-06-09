import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { LogoMark } from "@/components/ui/LogoMark";
export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const { token } = useSearch({ from: "/owner/reset-password" });
    const [form, setForm] = useState({ newPassword: "", confirm: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    async function submit(e) {
        e.preventDefault();
        setErr("");
        if (form.newPassword !== form.confirm) {
            setErr("Passwords do not match");
            return;
        }
        if (!token) {
            setErr("Invalid reset link — no token found");
            return;
        }
        setLoading(true);
        try {
            await api.owner.resetPassword(token, form.newPassword);
            setDone(true);
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : "Invalid or expired reset link");
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
        background: "#fff",
    };
    return (_jsx("div", { style: { minHeight: "100vh", background: "#f0eee9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }, children: _jsxs("div", { style: { width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { color: "var(--color-ink)" }, children: _jsx(LogoMark, { size: 28 }) }), _jsx("span", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "InBill Owner" })] }), _jsx("div", { style: { width: "100%", background: "#fff", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.05)" }, children: done ? (_jsxs("div", { style: { textAlign: "center", padding: "8px 0" }, children: [_jsx("div", { style: { width: 48, height: 48, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }, children: _jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-ink)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }) }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }, children: "Password updated" }), _jsx("p", { style: { fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.5, margin: "0 0 20px" }, children: "Your password has been changed. You can now sign in with your new password." }), _jsx("button", { className: "btn primary", onClick: () => navigate({ to: "/owner/login" }), style: { width: "100%", height: 44, justifyContent: "center", fontSize: 14 }, children: "Sign in" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 600, color: "var(--color-ink)" }, children: "Set new password" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 4 }, children: "Choose a strong password for your account." })] }), _jsxs("form", { onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }, children: "New password" }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("input", { type: showPassword ? "text" : "password", style: { ...inputStyle, paddingRight: 42 }, placeholder: "Min 8 characters", value: form.newPassword, onChange: (e) => setForm((f) => ({ ...f, newPassword: e.target.value })), required: true, autoFocus: true }), _jsx("button", { type: "button", onClick: () => setShowPassword((v) => !v), tabIndex: -1, style: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-ink-3)", display: "flex", alignItems: "center" }, children: showPassword ? (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" }), _jsx("line", { x1: "1", y1: "1", x2: "23", y2: "23" })] })) : (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] })) })] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }, children: "Confirm password" }), _jsx("input", { type: showPassword ? "text" : "password", style: inputStyle, placeholder: "Re-enter new password", value: form.confirm, onChange: (e) => setForm((f) => ({ ...f, confirm: e.target.value })), required: true })] }), err && _jsx("p", { style: { fontSize: 13, color: "var(--color-red)", margin: 0 }, children: err }), _jsx("button", { type: "submit", className: "btn primary", disabled: loading, style: { width: "100%", height: 44, justifyContent: "center", fontSize: 14, marginTop: 4 }, children: loading ? "Updating…" : "Set new password" })] })] })) })] }) }));
}
