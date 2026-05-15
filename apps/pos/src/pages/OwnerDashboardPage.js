import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
const DEFAULT_CREATE = { name: "", address: "", phone: "", gstin: "", timezone: "Asia/Kolkata" };
export default function OwnerDashboardPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(DEFAULT_CREATE);
    const [createErr, setCreateErr] = useState("");
    // Redirect if no owner token
    useEffect(() => {
        if (!localStorage.getItem("inbill_owner_token"))
            navigate({ to: "/owner/login" });
    }, [navigate]);
    const { data: outlets = [], isLoading, error } = useQuery({
        queryKey: ["owner-outlets"],
        queryFn: () => api.owner.outlets(),
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
        onSuccess: (res) => {
            localStorage.setItem("inbill_token", res.token);
            navigate({ to: "/floor" });
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
    if (isLoading) {
        return (_jsx("div", { className: "min-h-screen bg-gray-50 flex items-center justify-center", children: _jsx("p", { className: "text-gray-500", children: "Loading\u2026" }) }));
    }
    if (error) {
        return (_jsx("div", { className: "min-h-screen bg-gray-50 flex items-center justify-center", children: _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-red-600 mb-4", children: error.message }), _jsx("button", { onClick: logout, className: "text-sm text-blue-600 hover:underline", children: "Sign out" })] }) }));
    }
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsxs("header", { className: "bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-gray-900", children: "Owner Dashboard" }), _jsx("p", { className: "text-sm text-gray-500", children: new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setShowCreate(true), className: "bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors", children: "+ Add Outlet" }), _jsx("button", { onClick: logout, className: "text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100", children: "Sign out" })] })] }), _jsxs("div", { className: "bg-white border-b border-gray-100 px-6 py-3 flex gap-8", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wide", children: "Total Today" }), _jsx("p", { className: "text-lg font-bold text-gray-900", children: fmt(outlets.reduce((s, o) => s + o.todayRevenue, 0)) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wide", children: "Bills" }), _jsx("p", { className: "text-lg font-bold text-gray-900", children: outlets.reduce((s, o) => s + o.todayBillCount, 0) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wide", children: "Open Orders" }), _jsx("p", { className: "text-lg font-bold text-gray-900", children: outlets.reduce((s, o) => s + o.openOrderCount, 0) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wide", children: "Outlets" }), _jsx("p", { className: "text-lg font-bold text-gray-900", children: outlets.length })] })] }), _jsx("main", { className: "p-6", children: outlets.length === 0 ? (_jsxs("div", { className: "text-center py-20", children: [_jsx("p", { className: "text-gray-400 text-lg mb-2", children: "No outlets yet" }), _jsx("p", { className: "text-gray-400 text-sm mb-6", children: "Add your first outlet to get started" }), _jsx("button", { onClick: () => setShowCreate(true), className: "bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg", children: "Add Outlet" })] })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: outlets.map((outlet) => (_jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-semibold text-gray-900", children: outlet.name }), _jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: outlet.address })] }), outlet.openOrderCount > 0 && (_jsxs("span", { className: "bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full", children: [outlet.openOrderCount, " open"] }))] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "bg-gray-50 rounded-lg p-3", children: [_jsx("p", { className: "text-xs text-gray-500", children: "Today's Revenue" }), _jsx("p", { className: "text-base font-bold text-gray-900 mt-0.5", children: fmt(outlet.todayRevenue) })] }), _jsxs("div", { className: "bg-gray-50 rounded-lg p-3", children: [_jsx("p", { className: "text-xs text-gray-500", children: "Bills Today" }), _jsx("p", { className: "text-base font-bold text-gray-900 mt-0.5", children: outlet.todayBillCount })] })] }), _jsxs("div", { className: "flex items-center gap-2 pt-1 border-t border-gray-100", children: [outlet.upiVpa && (_jsx("span", { className: "text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full", children: "UPI" })), outlet.razorpayConfigured && (_jsx("span", { className: "text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full", children: "Razorpay" })), _jsx("div", { className: "flex-1" }), _jsx("button", { onClick: () => switchMutation.mutate(outlet.id), disabled: switchMutation.isPending, className: "text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors", children: "Open POS \u2192" })] })] }, outlet.id))) })) }), showCreate && (_jsx("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4", children: _jsxs("div", { className: "bg-white rounded-2xl shadow-xl w-full max-w-md p-6", children: [_jsx("h2", { className: "text-lg font-bold text-gray-900 mb-4", children: "Add Outlet" }), _jsxs("form", { onSubmit: handleCreate, className: "space-y-3", children: [["name", "address", "phone", "gstin"].map((field) => (_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1 capitalize", children: field === "gstin" ? "GSTIN (optional)" : field }), _jsx("input", { className: "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500", value: createForm[field], onChange: (e) => setCreateForm((f) => ({ ...f, [field]: e.target.value })), required: field !== "gstin" })] }, field))), createErr && _jsx("p", { className: "text-red-600 text-sm", children: createErr }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: () => setShowCreate(false), className: "flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm", children: "Cancel" }), _jsx("button", { type: "submit", disabled: createMutation.isPending, className: "flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50", children: createMutation.isPending ? "Creating…" : "Create" })] })] })] }) }))] }));
}
