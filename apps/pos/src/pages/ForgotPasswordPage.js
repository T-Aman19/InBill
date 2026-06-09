import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { LogoMark } from "@/components/ui/LogoMark";
export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    async function submit(e) {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            await api.owner.forgotPassword(email);
            setSubmitted(true);
        }
        catch {
            setErr("Something went wrong. Please try again.");
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
    return (_jsx("div", { style: { minHeight: "100vh", background: "#f0eee9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }, children: _jsxs("div", { style: { width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { color: "var(--color-ink)" }, children: _jsx(LogoMark, { size: 28 }) }), _jsx("span", { style: { fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }, children: "InBill Owner" })] }), _jsx("div", { style: { width: "100%", background: "#fff", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.05)" }, children: submitted ? (_jsxs("div", { style: { textAlign: "center", padding: "8px 0" }, children: [_jsx("div", { style: { width: 48, height: 48, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }, children: _jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "var(--color-ink)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "20 6 9 17 4 12" }) }) }), _jsx("div", { style: { fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }, children: "Check your email" }), _jsxs("p", { style: { fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.5, margin: "0 0 20px" }, children: ["If ", _jsx("strong", { children: email }), " is registered, you'll receive a password reset link within a few minutes."] }), _jsx("button", { onClick: () => navigate({ to: "/owner/login" }), style: { fontSize: 13, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }, children: "Back to sign in" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 22, fontWeight: 600, color: "var(--color-ink)" }, children: "Forgot password?" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 4 }, children: "Enter your email and we'll send a reset link." })] }), _jsxs("form", { onSubmit: submit, style: { display: "flex", flexDirection: "column", gap: 14 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }, children: "Email" }), _jsx("input", { type: "email", style: inputStyle, placeholder: "you@example.com", value: email, onChange: (e) => setEmail(e.target.value), required: true, autoFocus: true })] }), err && _jsx("p", { style: { fontSize: 13, color: "var(--color-red)", margin: 0 }, children: err }), _jsx("button", { type: "submit", className: "btn primary", disabled: loading, style: { width: "100%", height: 44, justifyContent: "center", fontSize: 14, marginTop: 4 }, children: loading ? "Sending…" : "Send reset link" })] }), _jsx("div", { style: { borderTop: "1px solid var(--color-line)", paddingTop: 18, marginTop: 20, textAlign: "center" }, children: _jsx("button", { type: "button", onClick: () => navigate({ to: "/owner/login" }), style: { fontSize: 12, color: "var(--color-accent)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }, children: "\u2190 Back to sign in" }) })] })) })] }) }));
}
