import { jsx as _jsx } from "react/jsx-runtime";
import { useIsTablet } from "@/hooks/useMediaQuery";
// Shared pattern for ManagerPage's grid-style lists (Staff, Customers, Loyalty,
// Bills, Activity, Reservations, Inventory, ...): a fixed-column grid header +
// rows on desktop/tablet-landscape, stacked cards below `tablet`. Each tab
// still supplies its own row/card markup (columns differ per tab and cells
// are bespoke — badges, avatars, action buttons) — this only centralizes the
// breakpoint switch and the card container styling.
export function ResponsiveListHeader({ columns, children }) {
    const isTablet = useIsTablet();
    if (isTablet)
        return null;
    return (_jsx("div", { style: { display: "grid", gridTemplateColumns: columns, padding: "12px 28px", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid var(--color-line)" }, children: children }));
}
export function ResponsiveListRow({ columns, card, opacity, children }) {
    const isTablet = useIsTablet();
    if (isTablet) {
        return (_jsx("div", { style: { padding: "14px 16px", borderBottom: "1px solid var(--color-line)", opacity: opacity ?? 1 }, children: card }));
    }
    return (_jsx("div", { style: { display: "grid", gridTemplateColumns: columns, padding: "14px 28px", alignItems: "center", borderBottom: "1px solid var(--color-line)", opacity: opacity ?? 1 }, onMouseEnter: (e) => (e.currentTarget.style.background = "var(--color-hover)"), onMouseLeave: (e) => (e.currentTarget.style.background = "transparent"), children: children }));
}
