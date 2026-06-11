import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
// ─── KOT status chip ─────────────────────────────────────────────────────────
function KotChip({ status }) {
    if (!status || status === "done")
        return null;
    const map = {
        pending: { label: "In kitchen", tone: "amber" },
        acknowledged: { label: "Acknowledged", tone: "blue" },
    };
    const cfg = map[status];
    if (!cfg)
        return null;
    return _jsxs("span", { className: `badge ${cfg.tone}`, children: [_jsx("span", { className: `dot ${cfg.tone}` }), cfg.label] });
}
// ─── Order item row ───────────────────────────────────────────────────────────
function OrderItemRow({ item, onDecrement, canEdit, }) {
    if (item.isVoided)
        return null;
    const isSent = !!item.kotId;
    return (_jsxs("div", { style: {
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 0",
            borderBottom: "1px solid var(--color-line)",
        }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: item.name }), item.variantName && (_jsx("div", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: item.variantName })), item.modifiers.length > 0 && (_jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: ["+ ", item.modifiers.map((m) => m.name).join(", ")] })), _jsx("div", { style: { marginTop: 4 }, children: isSent
                            ? _jsx(KotChip, { status: item.kotStatus })
                            : _jsxs("span", { className: "badge", children: [_jsx("span", { className: "dot gray" }), "Unsent"] }) })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }, children: [_jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)", textAlign: "right" }, children: formatCurrency(Number(item.unitPrice) * item.quantity) }), canEdit && !isSent && (_jsx("button", { onClick: onDecrement, style: {
                            width: 28, height: 28, borderRadius: 8,
                            border: "1px solid var(--color-line)",
                            background: "var(--color-surface-2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", flexShrink: 0,
                            WebkitTapHighlightColor: "transparent",
                        }, children: _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: _jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" }) }) })), _jsxs("div", { style: { fontSize: 13, fontWeight: 600, width: 20, textAlign: "center" }, children: ["\u00D7", item.quantity] })] })] }));
}
// ─── Variant + modifier picker sheet ─────────────────────────────────────────
function PickerSheet({ item, variants, modifierGroups, modifiers, itemModLinks, onConfirm, onCancel, }) {
    const itemVariants = variants.filter((v) => v.itemId === item.id && v.isActive);
    const linkedGroupIds = itemModLinks.filter((l) => l.itemId === item.id).map((l) => l.groupId);
    const groups = modifierGroups.filter((g) => linkedGroupIds.includes(g.id));
    const [selectedVariant, setSelectedVariant] = useState(itemVariants.length === 1 ? itemVariants[0]?.id : undefined);
    const [selectedMods, setSelectedMods] = useState([]);
    const hasVariants = itemVariants.length > 0;
    const hasModifiers = groups.length > 0;
    const canConfirm = !hasVariants || !!selectedVariant;
    function toggleMod(id, group) {
        setSelectedMods((prev) => {
            if (prev.includes(id))
                return prev.filter((m) => m !== id);
            if (!group.multiSelect) {
                const groupModIds = modifiers.filter((m) => m.groupId === group.id).map((m) => m.id);
                return [...prev.filter((m) => !groupModIds.includes(m)), id];
            }
            return [...prev, id];
        });
    }
    const price = selectedVariant
        ? Number(itemVariants.find((v) => v.id === selectedVariant)?.price ?? item.basePrice)
        : Number(item.basePrice);
    const modTotal = selectedMods.reduce((s, id) => {
        const m = modifiers.find((x) => x.id === id);
        return s + Number(m?.price ?? 0);
    }, 0);
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "animate-overlay-in", onClick: onCancel, style: {
                    position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 40,
                } }), _jsxs("div", { className: "animate-slide-up", style: {
                    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
                    background: "var(--color-surface)",
                    borderRadius: "20px 20px 0 0",
                    paddingBottom: "calc(16px + var(--safe-bottom))",
                    maxHeight: "80dvh",
                    display: "flex", flexDirection: "column",
                }, children: [_jsx("div", { style: { display: "flex", justifyContent: "center", padding: "12px 0 0" }, children: _jsx("div", { style: { width: 36, height: 4, borderRadius: 2, background: "var(--color-line-strong)" } }) }), _jsx("div", { style: { padding: "12px 20px 16px" }, children: _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 17, fontWeight: 600 }, children: item.name }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: formatCurrency(price + modTotal) })] }), _jsx("button", { onClick: onCancel, style: { background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--color-ink-3)" }, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), _jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) })] }) }), _jsxs("div", { className: "scroll", style: { flex: 1, padding: "0 20px" }, children: [hasVariants && (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-ink-3)", marginBottom: 10 }, children: "Size / Variant" }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: itemVariants.map((v) => (_jsxs("button", { onClick: () => setSelectedVariant(v.id), style: {
                                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                                padding: "12px 14px", borderRadius: 12,
                                                border: `1.5px solid ${selectedVariant === v.id ? "var(--color-accent)" : "var(--color-line)"}`,
                                                background: selectedVariant === v.id ? "var(--color-accent-soft)" : "var(--color-surface)",
                                                cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                            }, children: [_jsx("span", { style: { fontSize: 14, fontWeight: selectedVariant === v.id ? 600 : 400 }, children: v.name }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13 }, children: formatCurrency(v.price) })] }, v.id))) })] })), hasModifiers && groups.map((group) => (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsxs("div", { style: { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-ink-3)", marginBottom: 2 }, children: [group.name, group.required && _jsx("span", { style: { color: "var(--color-red)", marginLeft: 4 }, children: "*" })] }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-4)", marginBottom: 10 }, children: group.multiSelect ? "Select any" : "Select one" }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: modifiers.filter((m) => m.groupId === group.id && m.isActive).map((m) => {
                                            const active = selectedMods.includes(m.id);
                                            return (_jsxs("button", { onClick: () => toggleMod(m.id, group), style: {
                                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                                    padding: "12px 14px", borderRadius: 12,
                                                    border: `1.5px solid ${active ? "var(--color-accent)" : "var(--color-line)"}`,
                                                    background: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                                                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                                }, children: [_jsx("span", { style: { fontSize: 14, fontWeight: active ? 600 : 400 }, children: m.name }), Number(m.price) > 0 && (_jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-3)" }, children: ["+", formatCurrency(m.price)] }))] }, m.id));
                                        }) })] }, group.id)))] }), _jsx("div", { style: { padding: "12px 20px 0" }, children: _jsx("button", { className: "btn primary full lg", disabled: !canConfirm, onClick: () => onConfirm(selectedVariant, selectedMods), children: "Add to Order" }) })] })] }));
}
// ─── Order summary bottom sheet ───────────────────────────────────────────────
function OrderSheet({ order, onDecrement, onKot, kotLoading, onClose, }) {
    const activeItems = order.items.filter((i) => !i.isVoided);
    const unsentCount = activeItems.filter((i) => !i.kotId).length;
    const total = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    const canKot = unsentCount > 0;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "animate-overlay-in", onClick: onClose, style: {
                    position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 40,
                } }), _jsxs("div", { className: "animate-slide-up", style: {
                    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
                    background: "var(--color-surface)",
                    borderRadius: "20px 20px 0 0",
                    paddingBottom: "calc(16px + var(--safe-bottom))",
                    maxHeight: "70dvh",
                    display: "flex", flexDirection: "column",
                }, children: [_jsx("div", { style: { display: "flex", justifyContent: "center", padding: "12px 0 0" }, children: _jsx("div", { style: { width: 36, height: 4, borderRadius: 2, background: "var(--color-line-strong)" } }) }), _jsxs("div", { style: { padding: "12px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { style: { fontSize: 16, fontWeight: 600 }, children: ["Order (", activeItems.length, " items)"] }), _jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }, children: formatCurrency(total) })] }), _jsx("div", { className: "scroll", style: { flex: 1, padding: "0 20px" }, children: activeItems.map((item) => (_jsx(OrderItemRow, { item: item, onDecrement: () => onDecrement(item.id), canEdit: true }, item.id))) }), _jsx("div", { style: { padding: "12px 20px 0" }, children: _jsx("button", { className: `btn full lg ${canKot ? "green" : ""}`, disabled: !canKot || kotLoading, onClick: onKot, children: kotLoading
                                ? "Sending…"
                                : canKot
                                    ? `Send ${unsentCount} item${unsentCount > 1 ? "s" : ""} to Kitchen`
                                    : "All items sent" }) })] })] }));
}
// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrderPage() {
    const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" });
    const { tableId, customerId } = useSearch({ from: "/order/$orderId" });
    const navigate = useNavigate();
    const qc = useQueryClient();
    const isNew = routeOrderId === "new";
    const [currentOrderId, setCurrentOrderId] = useState(isNew ? null : routeOrderId);
    const orderIdRef = useRef(currentOrderId);
    useEffect(() => { orderIdRef.current = currentOrderId; }, [currentOrderId]);
    const [activeCat, setActiveCat] = useState(null);
    const [showSheet, setShowSheet] = useState(false);
    const [pickerItem, setPickerItem] = useState(null);
    const [kotLoading, setKotLoading] = useState(false);
    const [addingItem, setAddingItem] = useState(null);
    const { data: menu } = useQuery({
        queryKey: ["menu"],
        queryFn: () => api.menu.getAll(),
    });
    const { data: order } = useQuery({
        queryKey: ["order", currentOrderId],
        queryFn: () => api.orders.get(currentOrderId),
        enabled: !!currentOrderId,
    });
    useEffect(() => {
        if (menu?.categories?.[0] && !activeCat)
            setActiveCat(menu.categories[0]?.id ?? null);
    }, [menu, activeCat]);
    useEffect(() => {
        if (!currentOrderId)
            return;
        const unsub = ws.on("order.updated", (e) => {
            const updated = e.payload;
            if (updated.id === currentOrderId)
                qc.setQueryData(["order", currentOrderId], updated);
        });
        return unsub;
    }, [currentOrderId, qc]);
    async function handleAddItem(item, variantId, modifiers) {
        setPickerItem(null);
        setAddingItem(item.id);
        try {
            let oid = orderIdRef.current;
            if (!oid) {
                const newOrder = await api.orders.create({ type: "dine_in", tableId, customerId });
                oid = newOrder.id;
                setCurrentOrderId(oid);
                orderIdRef.current = oid;
            }
            await api.orders.addItem(oid, { menuItemId: item.id, quantity: 1, variantId, modifiers: modifiers ?? [] });
            qc.invalidateQueries({ queryKey: ["order", oid] });
            if (isNew)
                navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined, customerId: undefined }, replace: true });
        }
        finally {
            setAddingItem(null);
        }
    }
    function tapItem(item) {
        if (!item.isAvailable)
            return;
        const variants = menu?.variants.filter((v) => v.itemId === item.id && v.isActive) ?? [];
        const hasGroups = (menu?.itemModifierGroups.filter((l) => l.itemId === item.id).length ?? 0) > 0;
        if (variants.length > 0 || hasGroups) {
            setPickerItem(item);
        }
        else {
            void handleAddItem(item);
        }
    }
    async function handleDecrement(itemId) {
        if (!currentOrderId)
            return;
        await api.orders.decrementItem(currentOrderId, itemId);
        qc.invalidateQueries({ queryKey: ["order", currentOrderId] });
    }
    async function handleKot() {
        if (!currentOrderId)
            return;
        setKotLoading(true);
        try {
            await api.kots.generate(currentOrderId);
            qc.invalidateQueries({ queryKey: ["order", currentOrderId] });
            setShowSheet(false);
        }
        finally {
            setKotLoading(false);
        }
    }
    const categories = menu?.categories ?? [];
    const items = menu?.items ?? [];
    const catItems = items.filter((i) => i.categoryId === activeCat && i.isAvailable);
    const activeItems = order?.items.filter((i) => !i.isVoided) ?? [];
    const unsentCount = activeItems.filter((i) => !i.kotId).length;
    const orderTotal = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    const tableName = order?.tableName ?? (tableId ? `Table` : "Order");
    return (_jsxs("div", { style: { height: "100dvh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }, children: [_jsxs("div", { style: {
                    paddingTop: "calc(12px + var(--safe-top))",
                    paddingLeft: 16, paddingRight: 16, paddingBottom: 0,
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-line)",
                    flexShrink: 0,
                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, paddingBottom: 12 }, children: [_jsx("button", { onClick: () => navigate({ to: "/floor" }), style: {
                                    background: "transparent", border: "none", padding: 4,
                                    cursor: "pointer", color: "var(--color-ink-2)",
                                    WebkitTapHighlightColor: "transparent",
                                }, children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }) }), _jsx("div", { style: { flex: 1 }, children: _jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: tableName }) }), activeItems.length > 0 && (_jsxs("button", { onClick: () => setShowSheet(true), style: {
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", borderRadius: 10,
                                    background: "var(--color-accent-soft)",
                                    border: "1px solid var(--color-accent)",
                                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                                    color: "var(--color-accent-ink)",
                                }, children: [_jsxs("span", { style: { fontSize: 13, fontWeight: 600 }, children: [activeItems.length, " items"] }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 12 }, children: formatCurrency(orderTotal) })] }))] }), _jsx("div", { style: {
                            display: "flex", gap: 0, overflowX: "auto",
                            scrollbarWidth: "none", marginLeft: -16, marginRight: -16,
                            paddingLeft: 16,
                        }, children: categories.map((cat) => (_jsx("button", { onClick: () => setActiveCat(cat.id), style: {
                                padding: "10px 16px",
                                fontSize: 13, fontWeight: activeCat === cat.id ? 600 : 400,
                                color: activeCat === cat.id ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                                background: "transparent", border: "none", cursor: "pointer",
                                borderBottom: `2px solid ${activeCat === cat.id ? "var(--color-accent)" : "transparent"}`,
                                whiteSpace: "nowrap",
                                WebkitTapHighlightColor: "transparent",
                            }, children: cat.name }, cat.id))) })] }), _jsxs("div", { className: "scroll", style: { flex: 1, padding: 12 }, children: [catItems.length === 0 && (_jsx("div", { style: { textAlign: "center", padding: 48, color: "var(--color-ink-3)" }, children: "No items in this category" })), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }, children: catItems.map((item) => {
                            const isAdding = addingItem === item.id;
                            return (_jsxs("button", { onClick: () => tapItem(item), disabled: isAdding, style: {
                                    textAlign: "left", width: "100%",
                                    background: "var(--color-surface)",
                                    border: "1px solid var(--color-line)",
                                    borderRadius: 14, padding: "12px",
                                    cursor: "pointer", opacity: isAdding ? .6 : 1,
                                    boxShadow: "var(--shadow-1)",
                                    display: "flex", flexDirection: "column",
                                    WebkitTapHighlightColor: "transparent",
                                    touchAction: "manipulation",
                                    transition: "opacity .1s",
                                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }, children: [_jsx("span", { className: `veg-dot ${item.isVeg ? "veg" : "nonveg"}` }), isAdding && (_jsx("span", { style: { fontSize: 11, color: "var(--color-accent-ink)", fontWeight: 600 }, children: "Adding\u2026" }))] }), _jsx("div", { style: { fontSize: 14, fontWeight: 500, lineHeight: 1.3, marginBottom: 6, flex: 1 }, children: item.name }), _jsx("div", { style: { fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--color-ink-2)" }, children: formatCurrency(item.basePrice) })] }, item.id));
                        }) })] }), (currentOrderId || unsentCount > 0) && (_jsx("div", { style: {
                    padding: `10px 16px calc(10px + var(--safe-bottom))`,
                    background: "var(--color-surface)",
                    borderTop: "1px solid var(--color-line)",
                    flexShrink: 0,
                }, children: _jsx("button", { className: `btn full lg ${unsentCount > 0 ? "green" : "ghost"}`, disabled: unsentCount === 0 || kotLoading, onClick: unsentCount > 0 ? handleKot : () => setShowSheet(true), children: kotLoading
                        ? "Sending to kitchen…"
                        : unsentCount > 0
                            ? `Send ${unsentCount} item${unsentCount > 1 ? "s" : ""} to Kitchen`
                            : `View order (${activeItems.length})` }) })), pickerItem && menu && (_jsx(PickerSheet, { item: pickerItem, variants: menu.variants, modifierGroups: menu.modifierGroups, modifiers: menu.modifiers, itemModLinks: menu.itemModifierGroups, onConfirm: (variantId, mods) => void handleAddItem(pickerItem, variantId, mods), onCancel: () => setPickerItem(null) })), showSheet && order && (_jsx(OrderSheet, { order: order, onDecrement: (id) => void handleDecrement(id), onKot: handleKot, kotLoading: kotLoading, onClose: () => setShowSheet(false) }))] }));
}
