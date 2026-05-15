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
    return (_jsx("div", { className: "min-h-screen bg-gray-50 flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 mb-1", children: "InBill Owner" }), _jsx("p", { className: "text-gray-500 text-sm mb-6", children: "Manage all your outlets from one place" }), _jsx("div", { className: "flex rounded-lg bg-gray-100 p-1 mb-6", children: ["login", "register"].map((t) => (_jsx("button", { onClick: () => { setTab(t); setErr(""); }, className: `flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`, children: t === "login" ? "Sign In" : "Create Account" }, t))) }), _jsxs("form", { onSubmit: submit, className: "space-y-4", children: [tab === "register" && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Name" }), _jsx("input", { className: "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "Your name", value: form.name, onChange: set("name"), required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Phone" }), _jsx("input", { className: "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "10-digit mobile number", value: form.phone, onChange: set("phone"), required: true })] })] })), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Email" }), _jsx("input", { type: "email", className: "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "you@example.com", value: form.email, onChange: set("email"), required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Password" }), _jsx("input", { type: "password", className: "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "Min 8 characters", value: form.password, onChange: set("password"), required: true })] }), err && _jsx("p", { className: "text-red-600 text-sm", children: err }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors", children: loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account" })] }), _jsxs("p", { className: "text-center text-xs text-gray-400 mt-6", children: ["Staff login?", " ", _jsx("a", { href: "/login", className: "text-blue-600 hover:underline", children: "Go to POS" })] })] }) }));
}
