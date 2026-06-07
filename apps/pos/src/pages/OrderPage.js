import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
const TAX_RATE = 0.10;
/** Deterministic warm color from item name for thumbnail placeholder */
function itemThumbColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++)
        h = name.charCodeAt(i) + ((h << 5) - h);
    const hues = [28, 42, 56, 90, 148, 195];
    const l = [78, 82, 80, 84, 78, 76];
    const idx = Math.abs(h) % hues.length;
    return `oklch(${l[idx]}% 0.1 ${hues[idx]})`;
}
export default function OrderPage() {
    const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" });
    const { tableId, customerId } = useSearch({ from: "/order/$orderId" });
    const navigate = useNavigate();
    const qc = useQueryClient();
    const userRole = useAuthStore((s) => s.user?.role);
    const [activeCat, setActiveCat] = useState(null);
    const [search, setSearch] = useState("");
    // Variant / modifier picker state
    const [pendingItem, setPendingItem] = useState(null);
    const [pendingVariantId, setPendingVariantId] = useState(null);
    const [showVariants, setShowVariants] = useState(false);
    const [showModifiers, setShowModifiers] = useState(false);
    const [selectedMods, setSelectedMods] = useState([]);
    // Transfer / merge modal state
    const [showTransfer, setShowTransfer] = useState(false);
    const [showMerge, setShowMerge] = useState(false);
    const [showOverflow, setShowOverflow] = useState(false);
    const isNew = routeOrderId === "new";
    const [currentOrderId, setCurrentOrderId] = useState(isNew ? null : routeOrderId);
    const orderIdRef = useRef(currentOrderId);
    useEffect(() => { orderIdRef.current = currentOrderId; }, [currentOrderId]);
    const { data: menu } = useQuery({
        queryKey: ["menu"],
        queryFn: () => api.menu.getAll(),
    });
    const { data: order } = useQuery({
        queryKey: ["order", currentOrderId],
        queryFn: () => api.orders.get(currentOrderId),
        enabled: !!currentOrderId,
    });
    const { data: tablesData } = useQuery({
        queryKey: ["tables"],
        queryFn: () => api.tables.getAll(),
        enabled: showTransfer || showMerge,
    });
    const { data: openOrders } = useQuery({
        queryKey: ["orders"],
        queryFn: () => api.orders.getOpen(),
        enabled: showMerge,
    });
    useEffect(() => {
        if (menu?.categories?.[0] && !activeCat)
            setActiveCat(menu.categories[0].id);
    }, [menu]);
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
    const addItemMutation = useMutation({
        mutationFn: async (params) => {
            let oid = orderIdRef.current;
            // Recover table/type from cancelled order — URL search params are gone after first navigate
            let effectiveTableId = tableId;
            let effectiveType = "dine_in";
            // If the existing order was auto-cancelled (all items voided), start a fresh one
            if (oid) {
                const cached = qc.getQueryData(["order", oid]);
                if (cached?.status === "cancelled") {
                    if (cached.tableId)
                        effectiveTableId = cached.tableId;
                    if (cached.type)
                        effectiveType = cached.type;
                    oid = null;
                    setCurrentOrderId(null);
                    orderIdRef.current = null;
                }
            }
            if (!oid) {
                const newOrder = await api.orders.create({ type: effectiveType, tableId: effectiveTableId, customerId });
                oid = newOrder.id;
                setCurrentOrderId(oid);
                orderIdRef.current = oid;
            }
            return { oid, item: await api.orders.addItem(oid, { menuItemId: params.menuItemId, variantId: params.variantId, quantity: 1, modifiers: params.modifiers ?? [] }) };
        },
        onSuccess: ({ oid }) => {
            qc.invalidateQueries({ queryKey: ["order", oid] });
            if (isNew || oid !== routeOrderId)
                navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined, customerId: undefined }, replace: true });
        },
    });
    const transferMutation = useMutation({
        mutationFn: (newTableId) => api.orders.transfer(currentOrderId, newTableId),
        onSuccess: () => {
            setShowTransfer(false);
            qc.invalidateQueries({ queryKey: ["order", currentOrderId] });
            qc.invalidateQueries({ queryKey: ["tables"] });
        },
    });
    const mergeMutation = useMutation({
        mutationFn: (sourceOrderId) => api.orders.merge(currentOrderId, sourceOrderId),
        onSuccess: () => {
            setShowMerge(false);
            qc.invalidateQueries({ queryKey: ["order", currentOrderId] });
            qc.invalidateQueries({ queryKey: ["orders"] });
            qc.invalidateQueries({ queryKey: ["tables"] });
        },
    });
    const kotMutation = useMutation({
        mutationFn: () => api.kots.generate(currentOrderId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
    });
    const decrementMutation = useMutation({
        mutationFn: (itemId) => api.orders.decrementItem(currentOrderId, itemId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
    });
    const voidItemMutation = useMutation({
        mutationFn: (itemId) => api.orders.voidItem(currentOrderId, itemId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
    });
    function handleMenuItemClick(item) {
        const itemVariants = (menu?.variants ?? []).filter((v) => v.itemId === item.id && v.isActive);
        const linkedGroupIds = (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === item.id).map((l) => l.groupId);
        const hasModifiers = linkedGroupIds.length > 0 &&
            (menu?.modifiers ?? []).some((m) => linkedGroupIds.includes(m.groupId) && m.isActive);
        if (itemVariants.length > 0 || hasModifiers) {
            setPendingItem(item);
            setPendingVariantId(null);
            setSelectedMods([]);
            if (itemVariants.length > 0)
                setShowVariants(true);
            else
                setShowModifiers(true);
        }
        else {
            addItemMutation.mutate({ menuItemId: item.id });
        }
    }
    function handleVariantChosen(variantId) {
        setPendingVariantId(variantId);
        setShowVariants(false);
        if (!pendingItem)
            return;
        const linkedGroupIds = (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId);
        const hasModifiers = linkedGroupIds.length > 0 &&
            (menu?.modifiers ?? []).some((m) => linkedGroupIds.includes(m.groupId) && m.isActive);
        if (hasModifiers) {
            setShowModifiers(true);
        }
        else {
            addItemMutation.mutate({ menuItemId: pendingItem.id, variantId });
            setPendingItem(null);
        }
    }
    function handleModifiersConfirm() {
        if (!pendingItem)
            return;
        setShowModifiers(false);
        addItemMutation.mutate({ menuItemId: pendingItem.id, variantId: pendingVariantId ?? undefined, modifiers: selectedMods });
        setPendingItem(null);
        setPendingVariantId(null);
        setSelectedMods([]);
    }
    function cancelPicker() {
        setShowVariants(false);
        setShowModifiers(false);
        setPendingItem(null);
        setPendingVariantId(null);
        setSelectedMods([]);
    }
    const activeItems = order?.items.filter((i) => !i.isVoided) ?? [];
    const unsentItems = activeItems.filter((i) => !i.kotId);
    const unsentCount = unsentItems.reduce((s, i) => s + i.quantity, 0);
    const inKitchenItems = activeItems.filter((i) => i.kotId && i.kotStatus !== "done");
    const doneItems = activeItems.filter((i) => i.kotId && i.kotStatus === "done");
    const subtotal = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    const categories = menu?.categories ?? [];
    const menuItemById = new Map((menu?.items ?? []).map((m) => [m.id, m]));
    const menuItemsFiltered = (menu?.items ?? []).filter((i) => i.categoryId === activeCat && i.isAvailable &&
        (search === "" || i.name.toLowerCase().includes(search.toLowerCase())));
    const searchResults = search !== "" ? (menu?.items ?? []).filter((i) => i.isAvailable && i.name.toLowerCase().includes(search.toLowerCase())) : [];
    const pendingItemVariants = pendingItem ? (menu?.variants ?? []).filter((v) => v.itemId === pendingItem.id && v.isActive) : [];
    const pendingGroupIds = pendingItem ? (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId) : [];
    const pendingGroups = (menu?.modifierGroups ?? []).filter((g) => pendingGroupIds.includes(g.id));
    const availableTables = (tablesData?.tables ?? []).filter((t) => t.status === "available" && t.id !== order?.tableId);
    const mergeableOrders = (openOrders ?? []).filter((o) => o.id !== currentOrderId);
    const canManage = userRole === "manager" || userRole === "owner" || userRole === "cashier";
    const orderActive = order && order.status !== "billed" && order.status !== "cancelled";
    const isCounter = order?.type === "takeaway" || order?.type === "delivery";
    const tableLabel = order?.tableName ?? (isNew ? "New Order" : (isCounter ? (order?.type === "takeaway" ? "Takeaway" : "Delivery") : "Order"));
    // Display items in the menu grid (search overrides category)
    const displayItems = search !== "" ? searchResults : menuItemsFiltered;
    async function handleBill() {
        if (!currentOrderId)
            return;
        const bill = await api.bills.create({ orderId: currentOrderId });
        navigate({ to: "/billing/$billId", params: { billId: bill.id } });
    }
    const billBlocked = subtotal === 0
        ? "No items"
        : isCounter
            ? null
            : unsentItems.length > 0
                ? "Send KOT first"
                : inKitchenItems.length > 0
                    ? "Items in kitchen"
                    : null;
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }, children: [_jsxs("div", { style: { height: 56, flexShrink: 0, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }, children: [_jsx("button", { onClick: () => navigate({ to: "/floor" }), style: { width: 36, height: 36, borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }) }), _jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }, children: [_jsx("span", { className: "display", style: { fontSize: 20, fontWeight: 600 }, children: tableLabel }), order && (_jsx("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: order.type?.replace("_", " ") })), isNew && _jsx("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: "dine in" }), isCounter && !isNew && (_jsx("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", background: "rgba(251,146,60,.12)", color: "var(--color-amber)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 6, padding: "2px 7px" }, children: "Pay first" }))] }), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { style: { display: "flex", alignItems: "center", background: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "0 12px", height: 36, width: 260, gap: 8 }, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-ink-4)", flexShrink: 0 }, children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "M21 21l-4.5-4.5" })] }), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: `Search ${(menu?.items ?? []).length > 0 ? `${(menu?.items ?? []).length} items` : "menu"}…`, style: { border: "none", background: "transparent", outline: "none", fontSize: 13, flex: 1, color: "var(--color-ink)", fontFamily: "inherit" } }), search && (_jsx("button", { onClick: () => setSearch(""), style: { border: "none", background: "transparent", color: "var(--color-ink-4)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 16 }, children: "\u00D7" }))] }), canManage && !isNew && orderActive && order?.type === "dine_in" && (_jsxs("div", { style: { position: "relative" }, children: [_jsx("button", { onClick: () => setShowOverflow((v) => !v), style: { width: 36, height: 36, borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", children: [_jsx("circle", { cx: "5", cy: "12", r: "2" }), _jsx("circle", { cx: "12", cy: "12", r: "2" }), _jsx("circle", { cx: "19", cy: "12", r: "2" })] }) }), showOverflow && (_jsxs(_Fragment, { children: [_jsx("div", { onClick: () => setShowOverflow(false), style: { position: "fixed", inset: 0, zIndex: 40 } }), _jsxs("div", { style: { position: "absolute", top: 42, right: 0, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 50, minWidth: 180 }, children: [_jsxs("button", { onClick: () => { setShowTransfer(true); setShowOverflow(false); }, style: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)", textAlign: "left" }, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14M12 5l7 7-7 7" }) }), "Transfer table"] }), _jsxs("button", { onClick: () => { setShowMerge(true); setShowOverflow(false); }, style: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)", textAlign: "left" }, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-3" }) }), "Merge order"] })] })] }))] }))] }), _jsxs("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", overflow: "hidden" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", borderRight: "1px solid var(--color-line)", overflow: "hidden" }, children: [!search && (_jsx("div", { className: "scroll", style: { display: "flex", gap: 6, padding: "10px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", overflowX: "auto", overflowY: "hidden", flexShrink: 0 }, children: categories.map((cat) => {
                                    const active = activeCat === cat.id;
                                    return (_jsxs("button", { onClick: () => setActiveCat(cat.id), style: {
                                            padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500,
                                            background: active ? "var(--color-ink)" : "var(--color-surface)",
                                            color: active ? "var(--color-surface)" : "var(--color-ink-2)",
                                            border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                                            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .1s",
                                        }, children: [cat.name, _jsx("span", { style: { marginLeft: 6, fontFamily: "var(--font-mono)", opacity: .5, fontSize: 11 }, children: (menu?.items ?? []).filter((m) => m.categoryId === cat.id).length })] }, cat.id));
                                }) })), search && (_jsxs("div", { style: { padding: "10px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", gap: 8 }, children: [_jsxs("span", { className: "eyebrow", children: ["Results for \"", search, "\""] }), _jsxs("span", { style: { fontSize: 12, color: "var(--color-ink-3)" }, children: ["\u00B7 ", searchResults.length, " items"] })] })), _jsx("div", { className: "scroll", style: { flex: 1, padding: 16, overflowY: "auto" }, children: displayItems.length === 0 && search ? (_jsxs("div", { style: { textAlign: "center", padding: 60, color: "var(--color-ink-3)", fontSize: 13 }, children: ["No items match \"", search, "\""] })) : displayItems.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: 60, color: "var(--color-ink-3)", fontSize: 13 }, children: "No items in this category" })) : (_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }, children: displayItems.map((item) => {
                                        const inCart = activeItems.find((l) => l.menuItemId === item.id && !l.kotId);
                                        const hasVariants = (menu?.variants ?? []).some((v) => v.itemId === item.id && v.isActive);
                                        const thumbColor = itemThumbColor(item.name);
                                        return (_jsxs("button", { onClick: () => handleMenuItemClick(item), style: {
                                                appearance: "none", textAlign: "left",
                                                background: "var(--color-surface)",
                                                border: "1px solid " + (inCart ? "var(--color-ink)" : "var(--color-line)"),
                                                borderRadius: 12, padding: 12, cursor: "pointer",
                                                display: "flex", gap: 12, alignItems: "flex-start",
                                                position: "relative", transition: "all .1s",
                                                boxShadow: inCart ? "0 0 0 2px var(--color-ink)" : "0 1px 3px rgba(0,0,0,.04)",
                                            }, children: [_jsx("div", { style: { width: 48, height: 48, borderRadius: 8, background: thumbColor, flexShrink: 0 } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }, children: _jsx("span", { className: `veg-dot ${item.isVeg ? "veg" : "nonveg"}` }) }), _jsx("div", { style: { fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "var(--color-ink)" }, children: item.name }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }, children: [_jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-2)", fontWeight: 500 }, children: formatCurrency(item.basePrice) }), hasVariants && _jsx("span", { style: { fontSize: 10, color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 4, padding: "1px 5px" }, children: "variants" })] })] }), inCart && (_jsx("span", { style: { position: "absolute", top: 8, right: 8, background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", padding: "0 5px" }, children: inCart.quantity }))] }, item.id));
                                    }) })) })] }), _jsxs("div", { style: { background: "var(--color-surface)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [activeItems.length === 0 && (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--color-ink-3)", padding: 40 }, children: [_jsx("div", { style: { width: 52, height: 52, borderRadius: "50%", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" }), _jsx("path", { d: "M14 3v5h5M8 13h8M8 17h6" })] }) }), _jsx("div", { style: { fontSize: 13 }, children: "Tap menu items to add" })] })), inKitchenItems.length > 0 && (_jsxs("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--color-line)", flexShrink: 0 }, children: [_jsx("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, children: _jsxs("div", { className: "eyebrow", style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "var(--color-amber)", display: "inline-block" } }), "In kitchen \u00B7 ", inKitchenItems.reduce((s, i) => s + i.quantity, 0), " items"] }) }), _jsx("div", { className: "scroll", style: { maxHeight: 130, overflowY: "auto" }, children: inKitchenItems.map((line) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: "var(--color-ink-3)" }, children: [_jsxs("span", { style: { minWidth: 22, fontFamily: "var(--font-mono)", flexShrink: 0 }, children: [line.quantity, "\u00D7"] }), _jsxs("span", { style: { flex: 1, lineHeight: 1.2 }, children: [line.name, line.variantName ? ` (${line.variantName})` : ""] }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 11 }, children: formatCurrency(String(Number(line.unitPrice) * line.quantity)) })] }, line.id))) })] })), doneItems.length > 0 && (_jsx("div", { style: { padding: "8px 18px", borderBottom: "1px solid var(--color-line)", background: "var(--color-green-soft)", flexShrink: 0 }, children: _jsxs("div", { className: "eyebrow", style: { display: "flex", alignItems: "center", gap: 6, color: "var(--color-green)" }, children: [_jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }), doneItems.reduce((s, i) => s + i.quantity, 0), " items ready"] }) })), unsentItems.length > 0 && (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }, children: [_jsx("div", { style: { padding: "14px 18px 8px", flexShrink: 0 }, children: _jsxs("div", { className: "eyebrow", style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", display: "inline-block" } }), "To send \u00B7 ", unsentItems.length, " item", unsentItems.length > 1 ? "s" : ""] }) }), _jsx("div", { className: "scroll", style: { flex: 1, padding: "0 18px", overflowY: "auto" }, children: unsentItems.map((line, i) => (_jsx("div", { style: { padding: "10px 0", borderBottom: i < unsentItems.length - 1 ? "1px solid var(--color-line)" : "none" }, children: _jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 }, children: [_jsx("span", { className: `veg-dot ${menuItemById.get(line.menuItemId)?.isVeg ? "veg" : "nonveg"}`, style: { marginTop: 4, flexShrink: 0 } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--color-ink)", lineHeight: 1.2 }, children: [line.name, line.variantName && _jsxs("span", { style: { fontSize: 11, color: "var(--color-ink-3)", marginLeft: 5 }, children: ["(", line.variantName, ")"] })] }), line.modifiers && line.modifiers.length > 0 && (_jsx("div", { style: { marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }, children: line.modifiers.map((m, mi) => (_jsxs("span", { style: { fontSize: 10, color: "var(--color-accent-ink)", background: "var(--color-accent-soft)", borderRadius: 4, padding: "1px 5px", fontWeight: 500 }, children: ["+", m.name] }, mi))) }))] }), _jsxs("div", { style: { display: "flex", alignItems: "center", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-line)", flexShrink: 0 }, children: [_jsx("button", { onClick: () => decrementMutation.mutate(line.id), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14" }) }) }), _jsx("span", { style: { minWidth: 22, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }, children: line.quantity }), _jsx("button", { onClick: () => addItemMutation.mutate({ menuItemId: line.menuItemId, variantId: line.variantId ?? undefined }), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M12 5v14M5 12h14" }) }) })] }), _jsx("button", { onClick: () => voidItemMutation.mutate(line.id), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-4)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }, children: _jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" }) }) })] }) }, line.id))) })] })), unsentItems.length === 0 && activeItems.length > 0 && _jsx("div", { style: { flex: 1 } }), activeItems.length > 0 && (_jsxs("div", { style: { padding: "14px 18px 18px", background: "var(--color-bg)", borderTop: "1px solid var(--color-line)", flexShrink: 0 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-ink-3)" }, children: [_jsxs("span", { children: ["Subtotal \u00B7 ", activeItems.reduce((s, i) => s + i.quantity, 0), " items"] }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(subtotal) })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-ink-4)", marginTop: 3 }, children: [_jsx("span", { children: "CGST 5% + SGST 5%" }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(tax) })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-line)" }, children: [_jsx("span", { children: "Total" }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(total) })] }), order?.status === "billed" && order.billId ? (_jsx("button", { onClick: () => navigate({ to: "/billing/$billId", params: { billId: order.billId } }), style: { width: "100%", height: 50, marginTop: 14, borderRadius: 12, background: order.billIsPaid ? "var(--color-bg)" : "var(--color-green)", border: order.billIsPaid ? "1px solid var(--color-line)" : "1px solid oklch(42% 0.1 150)", color: order.billIsPaid ? "var(--color-ink-2)" : "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }, children: order.billIsPaid ? "View Receipt" : "Collect Payment" })) : isCounter ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }, children: [userRole !== "captain" && (_jsxs("button", { onClick: handleBill, disabled: subtotal === 0, style: { width: "100%", height: 50, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(42% 0.1 150)", color: "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: subtotal > 0 ? "pointer" : "not-allowed", opacity: subtotal > 0 ? 1 : .4 }, children: ["Charge", unsentCount > 0 && _jsx("span", { style: { fontSize: 11, opacity: .75, fontWeight: 400, marginLeft: 6 }, children: "\u00B7 KOT auto-sent" })] })), unsentCount > 0 && (_jsx("button", { onClick: () => kotMutation.mutate(), disabled: kotMutation.isPending, style: { width: "100%", height: 36, borderRadius: 10, background: "transparent", border: "1px dashed var(--color-line-strong)", color: "var(--color-ink-3)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }, children: "Send KOT early" }))] })) : (_jsxs("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [_jsxs("button", { onClick: () => kotMutation.mutate(), disabled: unsentCount === 0 || kotMutation.isPending, style: { flex: 2, height: 50, borderRadius: 12, background: "var(--color-accent)", border: "1px solid oklch(64% 0.17 55)", color: "var(--color-accent-ink)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: unsentCount > 0 ? "pointer" : "not-allowed", opacity: unsentCount > 0 ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, children: ["Send KOT", unsentCount > 0 && (_jsx("span", { style: { background: "rgba(0,0,0,.18)", borderRadius: 999, padding: "2px 9px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }, children: unsentCount }))] }), userRole !== "captain" && (_jsx("button", { onClick: handleBill, disabled: !!billBlocked, title: billBlocked ?? undefined, style: { flex: 1, height: 50, borderRadius: 12, background: billBlocked ? "var(--color-bg)" : "var(--color-ink)", border: billBlocked ? "1px solid var(--color-line)" : "1px solid var(--color-ink)", color: billBlocked ? "var(--color-ink-3)" : "var(--color-surface)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: !billBlocked ? "pointer" : "not-allowed", opacity: billBlocked ? .45 : 1 }, children: "Bill" }))] })), !isCounter && unsentItems.length > 0 && (_jsx("div", { style: { fontSize: 11, color: "var(--color-ink-4)", marginTop: 7, textAlign: "center" }, children: "Bill enables when nothing is pending" }))] }))] })] }), showVariants && pendingItem && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: pendingItem.name }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Choose a variant" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: pendingItemVariants.map((v) => (_jsxs("button", { onClick: () => handleVariantChosen(v.id), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, children: [_jsx("span", { style: { fontSize: 14, fontWeight: 500, color: "var(--color-ink)" }, children: v.name }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--color-ink-2)" }, children: formatCurrency(v.price) })] }, v.id))) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: cancelPicker, style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) })), showModifiers && pendingItem && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 440, maxHeight: "76vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: pendingItem.name }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Customise your order" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }, children: pendingGroups.map((group) => {
                                const groupMods = (menu?.modifiers ?? []).filter((m) => m.groupId === group.id && m.isActive);
                                return (_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }, children: group.name }), group.required
                                                    ? _jsx("span", { style: { fontSize: 10, background: "var(--color-red-soft)", color: "var(--color-red)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }, children: "Required" })
                                                    : _jsxs("span", { style: { fontSize: 10, color: "var(--color-ink-3)" }, children: ["Optional \u00B7 ", group.multiSelect ? "multi-select" : "pick one"] })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: groupMods.map((m) => {
                                                const checked = selectedMods.includes(m.id);
                                                return (_jsxs("button", { onClick: () => {
                                                        if (!group.multiSelect) {
                                                            const siblings = groupMods.map((gm) => gm.id);
                                                            setSelectedMods((prev) => [...prev.filter((id) => !siblings.includes(id)), ...(checked ? [] : [m.id])]);
                                                        }
                                                        else {
                                                            setSelectedMods((prev) => checked ? prev.filter((id) => id !== m.id) : [...prev, m.id]);
                                                        }
                                                    }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, border: `1px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-bg)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { width: 16, height: 16, borderRadius: group.multiSelect ? 3 : "50%", border: `2px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-ink)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }, children: checked && _jsx("svg", { width: "9", height: "9", viewBox: "0 0 24 24", fill: "none", stroke: "white", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }, children: m.name })] }), Number(m.price) > 0 && _jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }, children: ["+", formatCurrency(m.price)] })] }, m.id));
                                            }) })] }, group.id));
                            }) }), _jsxs("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)", display: "flex", gap: 8 }, children: [_jsx("button", { onClick: cancelPicker, style: { flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }), _jsx("button", { onClick: handleModifiersConfirm, style: { flex: 2, height: 40, borderRadius: 10, border: "none", background: "var(--color-ink)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-surface)", fontFamily: "inherit" }, children: "Add to Order" })] })] }) })), showTransfer && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: "Transfer Table" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Move this order to another available table" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto" }, children: availableTables.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: 40, color: "var(--color-ink-3)" }, children: "No available tables" })) : (_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }, children: availableTables.map((t) => (_jsxs("button", { onClick: () => transferMutation.mutate(t.id), disabled: transferMutation.isPending, style: { padding: "16px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--color-ink)", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, children: [_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-green)" }, children: [_jsx("rect", { x: "3", y: "8", width: "18", height: "10", rx: "1.5" }), _jsx("path", { d: "M1 14h22M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2" })] }), t.name] }, t.id))) })) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: () => setShowTransfer(false), style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) })), showMerge && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: "Merge Order" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Pull another order's items into this one" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: mergeableOrders.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: 40, color: "var(--color-ink-3)" }, children: "No other open orders" })) : mergeableOrders.map((o) => {
                                const tableEntry = (tablesData?.tables ?? []).find((t) => t.id === o.tableId);
                                const label = tableEntry?.name ?? (o.type === "takeaway" ? "Takeaway" : "Order");
                                const qty = o.items.filter((i) => !i.isVoided).reduce((s, i) => s + i.quantity, 0);
                                return (_jsxs("button", { onClick: () => mergeMutation.mutate(o.id), disabled: mergeMutation.isPending, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }, children: label }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }, children: [qty, " items \u00B7 ", o.type.replace("_", " ")] })] }), _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-ink-3)" }, children: _jsx("path", { d: "M9 18l6-6-6-6" }) })] }, o.id));
                            }) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: () => setShowMerge(false), style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) }))] }));
}
