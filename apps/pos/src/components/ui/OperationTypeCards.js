import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const OPTIONS = [
    {
        id: "full_service",
        title: "Full-Service Restaurant",
        description: "Floor page with tables & seating. Orders go to a Kitchen display (KDS) — billing is blocked until food is marked ready.",
        icon: (_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "3", y: "6", width: "18", height: "11", rx: "1.5" }), _jsx("path", { d: "M3 11h18M7 17v3M17 17v3" })] })),
    },
    {
        id: "quick_service",
        title: "Quick Service / Counter",
        description: "No tables, no Kitchen tab. Take the order and charge immediately, like a billing counter.",
        icon: (_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "7", width: "20", height: "13", rx: "2" }), _jsx("path", { d: "M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M2 12h20" })] })),
    },
    {
        id: "cloud_kitchen",
        title: "Cloud Kitchen / Delivery",
        description: "No tables, but keeps the Kitchen tab — orders still get a kitchen ticket for delivery/takeaway prep.",
        icon: (_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z" }), _jsx("path", { d: "M8 8V6a4 4 0 018 0v2" }), _jsx("path", { d: "M9 13h6" })] })),
    },
];
export function operationTypeFromSettings(settings) {
    const hasTables = settings?.hasTables !== false;
    const hasKitchenWorkflow = settings?.hasKitchenWorkflow !== false;
    if (hasTables)
        return "full_service";
    return hasKitchenWorkflow ? "cloud_kitchen" : "quick_service";
}
export function operationTypeToSettings(type) {
    if (type === "full_service")
        return { hasTables: true, hasKitchenWorkflow: true };
    if (type === "cloud_kitchen")
        return { hasTables: false, hasKitchenWorkflow: true };
    return { hasTables: false, hasKitchenWorkflow: false };
}
export function OperationTypeCards({ value, onChange }) {
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [OPTIONS.map((o) => {
                const active = value === o.id;
                return (_jsxs("button", { type: "button", onClick: () => onChange(o.id), style: {
                        display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
                        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        border: "1.5px solid " + (active ? "var(--color-ink)" : "var(--color-line-strong)"),
                        background: active ? "var(--color-surface-2)" : "var(--color-surface)",
                        fontFamily: "inherit",
                    }, children: [_jsx("div", { style: { color: active ? "var(--color-ink)" : "var(--color-ink-3)", marginTop: 1, flexShrink: 0 }, children: o.icon }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }, children: o.title }), _jsx("div", { style: { fontSize: 11.5, color: "var(--color-ink-3)", marginTop: 2, lineHeight: 1.4 }, children: o.description })] })] }, o.id));
            }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-4)", marginTop: 2 }, children: "You can change this anytime from Manager \u2192 Outlet settings." })] }));
}
