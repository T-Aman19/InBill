import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { formatCurrency } from "@/lib/utils";
import { TopBar } from "@/components/ui/TopBar";
import { useAuthStore } from "@/stores/auth";
const TAX_RATE = 0.10;
export default function OrderPage() {
    const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" });
    const { tableId } = useSearch({ from: "/order/$orderId" });
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
            if (!oid) {
                const newOrder = await api.orders.create({ type: "dine_in", tableId });
                oid = newOrder.id;
                setCurrentOrderId(oid);
                orderIdRef.current = oid;
            }
            return { oid, item: await api.orders.addItem(oid, { menuItemId: params.menuItemId, variantId: params.variantId, quantity: 1, modifiers: params.modifiers ?? [] }) };
        },
        onSuccess: ({ oid }) => {
            qc.invalidateQueries({ queryKey: ["order", oid] });
            if (isNew)
                navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined }, replace: true });
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
    const subtotal = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    const categories = menu?.categories ?? [];
    const menuItemsFiltered = (menu?.items ?? []).filter((i) => i.categoryId === activeCat && i.isAvailable &&
        (search === "" || i.name.toLowerCase().includes(search.toLowerCase())));
    const pendingItemVariants = pendingItem ? (menu?.variants ?? []).filter((v) => v.itemId === pendingItem.id && v.isActive) : [];
    const pendingGroupIds = pendingItem ? (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId) : [];
    const pendingGroups = (menu?.modifierGroups ?? []).filter((g) => pendingGroupIds.includes(g.id));
    const availableTables = (tablesData?.tables ?? []).filter((t) => t.status === "available" && t.id !== order?.tableId);
    const mergeableOrders = (openOrders ?? []).filter((o) => o.id !== currentOrderId);
    const canManage = userRole === "manager" || userRole === "owner" || userRole === "cashier";
    const orderActive = order && order.status !== "billed" && order.status !== "cancelled";
    async function handleBill() {
        if (!currentOrderId)
            return;
        const bill = await api.bills.create({ orderId: currentOrderId });
        navigate({ to: "/billing/$billId", params: { billId: bill.id } });
    }
    return (_jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }, children: [_jsx(TopBar, { current: "floor" }), _jsxs("div", { style: { height: 56, flexShrink: 0, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 20px", gap: 12 }, children: [_jsx("button", { onClick: () => navigate({ to: "/floor" }), style: { background: "transparent", border: "none", color: "var(--color-ink-2)", padding: 8, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "transparent", children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M15 18l-6-6 6-6" }) }) }), _jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 10 }, children: [_jsx("h2", { style: { margin: 0, fontSize: 18, fontWeight: 600 }, children: order?.tableName ?? (isNew ? "New Order" : (order?.type === "takeaway" ? "Takeaway" : "Order")) }), _jsx("span", { style: { fontSize: 12, color: "var(--color-ink-3)", textTransform: "capitalize" }, children: isNew ? "dine in · add items to open" : order?.type?.replace("_", " ") })] }), canManage && !isNew && orderActive && order?.type === "dine_in" && (_jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsxs("button", { onClick: () => setShowTransfer(true), style: { fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-line)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "transparent", children: [_jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" }) }), "Transfer"] }), _jsxs("button", { onClick: () => setShowMerge(true), style: { fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-line)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "transparent", children: [_jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-3" }) }), "Merge"] })] })), _jsx("div", { style: { flex: 1 } }), _jsxs("div", { style: { display: "flex", alignItems: "center", background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "6px 12px", gap: 8, width: 220 }, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-ink-3)", flexShrink: 0 }, children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "M21 21l-4.5-4.5" })] }), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search menu", style: { border: "none", background: "transparent", outline: "none", fontSize: 13, flex: 1, color: "var(--color-ink)" } })] })] }), _jsxs("div", { style: { flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", borderRight: "1px solid var(--color-line)", overflow: "hidden" }, children: [_jsx("div", { className: "scroll", style: { display: "flex", gap: 4, padding: "12px 20px", borderBottom: "1px solid var(--color-line)", overflowX: "auto", overflowY: "hidden", flexShrink: 0 }, children: categories.map((cat) => (_jsxs("button", { onClick: () => setActiveCat(cat.id), style: {
                                        background: activeCat === cat.id ? "var(--color-ink)" : "transparent",
                                        color: activeCat === cat.id ? "var(--color-bg)" : "var(--color-ink-2)",
                                        border: "1px solid " + (activeCat === cat.id ? "var(--color-ink)" : "var(--color-line)"),
                                        padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                                        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .1s",
                                    }, children: [cat.name, _jsx("span", { style: { marginLeft: 7, opacity: .5, fontFamily: "var(--font-mono)", fontSize: 11 }, children: (menu?.items ?? []).filter((m) => m.categoryId === cat.id).length })] }, cat.id))) }), _jsxs("div", { className: "scroll", style: { flex: 1, padding: 20 }, children: [_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }, children: menuItemsFiltered.map((item) => {
                                            const inCart = activeItems.find((l) => l.menuItemId === item.id && !l.kotId);
                                            const hasVariants = (menu?.variants ?? []).some((v) => v.itemId === item.id && v.isActive);
                                            return (_jsxs("button", { onClick: () => handleMenuItemClick(item), style: {
                                                    background: "var(--color-surface)", border: "1px solid " + (inCart ? "var(--color-ink)" : "var(--color-line)"),
                                                    borderRadius: 12, padding: "14px", cursor: "pointer", textAlign: "left",
                                                    display: "flex", flexDirection: "column", gap: 8, minHeight: 88, position: "relative",
                                                    transition: "all .1s", boxShadow: "var(--shadow-1)",
                                                }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "var(--color-surface)", children: [_jsxs("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }, children: [_jsx("span", { className: `veg-dot ${item.isVeg ? "veg" : "nonveg"}` }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, lineHeight: 1.25, color: "var(--color-ink)" }, children: item.name })] }), inCart && (_jsx("span", { style: { background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 11, fontWeight: 600, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", flexShrink: 0, padding: "0 6px" }, children: inCart.quantity }))] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)", fontWeight: 500 }, children: formatCurrency(item.basePrice) }), hasVariants && _jsx("span", { style: { fontSize: 10, color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 4, padding: "1px 5px" }, children: "variants" })] })] }, item.id));
                                        }) }), menuItemsFiltered.length === 0 && search && (_jsxs("div", { style: { textAlign: "center", padding: 60, color: "var(--color-ink-3)" }, children: ["No items match \"", search, "\""] }))] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", background: "var(--color-surface)", overflow: "hidden" }, children: [_jsx("div", { style: { padding: "16px 20px", borderBottom: "1px solid var(--color-line)" }, children: _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 600 }, children: "Current Order" }), _jsx("div", { style: { fontSize: 11, color: "var(--color-ink-3)" }, children: activeItems.length === 0 ? "No items" : `${activeItems.reduce((s, i) => s + i.quantity, 0)} items` })] }) }), _jsxs("div", { className: "scroll", style: { flex: 1, padding: "8px" }, children: [activeItems.length === 0 && (_jsxs("div", { style: { textAlign: "center", padding: 40, color: "var(--color-ink-3)", fontSize: 13 }, children: [_jsx("div", { style: { width: 48, height: 48, borderRadius: "50%", background: "var(--color-surface-2)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-4)" }, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" }), _jsx("path", { d: "M14 3v5h5M8 13h8M8 17h6" })] }) }), "Tap menu items to add"] })), activeItems.map((line, i) => {
                                        const sent = !!line.kotId;
                                        return (_jsxs("div", { style: { padding: "10px 12px", borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 10, opacity: sent && line.kotStatus !== "done" ? .65 : 1, borderBottom: i < activeItems.length - 1 ? "1px solid var(--color-line)" : "none" }, children: [_jsx("span", { className: "veg-dot veg", style: { flexShrink: 0, marginTop: 4 } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--color-ink)", lineHeight: 1.2 }, children: [line.name, line.variantName && _jsxs("span", { style: { fontSize: 11, color: "var(--color-ink-3)", marginLeft: 5 }, children: ["(", line.variantName, ")"] })] }), line.modifiers && line.modifiers.length > 0 && (_jsx("div", { style: { marginTop: 3, display: "flex", flexWrap: "wrap", gap: 3 }, children: line.modifiers.map((m, mi) => (_jsxs("span", { style: { fontSize: 10, color: "var(--color-ink-3)", background: "var(--color-surface-2)", borderRadius: 4, padding: "1px 5px" }, children: ["+", m.name] }, mi))) })), _jsxs("div", { style: { fontSize: 11, color: "var(--color-ink-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }, children: [_jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(line.unitPrice) }), sent && line.kotStatus === "done" && _jsx("span", { style: { color: "var(--color-green)", fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }, children: "\u00B7 Ready" }), sent && line.kotStatus !== "done" && _jsx("span", { style: { color: "var(--color-amber)", fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }, children: "\u00B7 In kitchen" })] })] }), !sent ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-line)" }, children: [_jsx("button", { onClick: () => decrementMutation.mutate(line.id), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12h14" }) }) }), _jsx("span", { style: { minWidth: 22, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }, children: line.quantity }), _jsx("button", { onClick: () => addItemMutation.mutate({ menuItemId: line.menuItemId, variantId: line.variantId ?? undefined }), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M12 5v14M5 12h14" }) }) })] }), _jsx("button", { onClick: () => voidItemMutation.mutate(line.id), style: { width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }, onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-red-soft)"; e.currentTarget.style.color = "var(--color-red)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-ink-3)"; }, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" }) }) })] })) : (_jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }, children: ["\u00D7", line.quantity] }))] }, line.id));
                                    })] }), _jsxs("div", { style: { padding: "12px 20px 16px", borderTop: "1px solid var(--color-line)", background: "var(--color-surface-2)" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-ink-2)" }, children: [_jsx("span", { children: "Subtotal" }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(subtotal) })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-ink-3)", marginTop: 4 }, children: [_jsx("span", { children: "+ Tax (5% CGST + 5% SGST)" }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(tax) })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 600, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-line)" }, children: [_jsx("span", { children: "Total" }), _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: formatCurrency(total) })] }), order?.status === "billed" && order.billId ? (_jsxs("button", { onClick: () => navigate({ to: "/billing/$billId", params: { billId: order.billId } }), style: { width: "100%", height: 52, marginTop: 14, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(58% 0.13 150)", color: "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "7", width: "20", height: "11", rx: "1.5" }), _jsx("circle", { cx: "12", cy: "12.5", r: "2.5" }), _jsx("path", { d: "M5 10v.01M19 15v.01" })] }), "Collect Payment"] })) : (_jsxs("div", { style: { display: "flex", gap: 8, marginTop: 14 }, children: [_jsxs("button", { onClick: () => kotMutation.mutate(), disabled: unsentCount === 0 || kotMutation.isPending, style: { flex: 1, height: 48, borderRadius: 12, background: "var(--color-amber)", border: "1px solid oklch(70% 0.15 70)", color: "oklch(20% 0.05 70)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: unsentCount > 0 ? "pointer" : "not-allowed", opacity: unsentCount > 0 ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" }), _jsx("path", { d: "M14 3v5h5M8 13h8M8 17h6" })] }), "Send KOT", unsentCount > 0 && _jsx("span", { style: { background: "rgba(0,0,0,.15)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700 }, children: unsentCount })] }), userRole !== "captain" && (() => {
                                                const billBlocked = subtotal === 0 ? "No items" : unsentItems.length > 0 ? "Send KOT first" : inKitchenItems.length > 0 ? "Items in kitchen" : null;
                                                return (_jsxs("button", { onClick: handleBill, disabled: !!billBlocked, title: billBlocked ?? undefined, style: { flex: 1, height: 48, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(58% 0.13 150)", color: "white", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: !billBlocked ? "pointer" : "not-allowed", opacity: !billBlocked ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("rect", { x: "2", y: "7", width: "20", height: "11", rx: "1.5" }), _jsx("circle", { cx: "12", cy: "12.5", r: "2.5" }), _jsx("path", { d: "M5 10v.01M19 15v.01" })] }), billBlocked ?? "Bill"] }));
                                            })()] }))] })] })] }), showVariants && pendingItem && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: pendingItem.name }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Choose a variant" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: pendingItemVariants.map((v) => (_jsxs("button", { onClick: () => handleVariantChosen(v.id), style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "var(--color-bg)", children: [_jsx("span", { style: { fontSize: 14, fontWeight: 500, color: "var(--color-ink)" }, children: v.name }), _jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--color-ink-2)" }, children: formatCurrency(v.price) })] }, v.id))) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: cancelPicker, style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) })), showModifiers && pendingItem && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 440, maxHeight: "76vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: pendingItem.name }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Customise your order" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }, children: pendingGroups.map((group) => {
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
                                                    }, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, border: `1px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-surface-2)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { width: 16, height: 16, borderRadius: group.multiSelect ? 3 : "50%", border: `2px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-ink)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }, children: checked && _jsx("svg", { width: "9", height: "9", viewBox: "0 0 24 24", fill: "none", stroke: "white", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }), _jsx("span", { style: { fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }, children: m.name })] }), Number(m.price) > 0 && _jsxs("span", { style: { fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }, children: ["+", formatCurrency(m.price)] })] }, m.id));
                                            }) })] }, group.id));
                            }) }), _jsxs("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)", display: "flex", gap: 8 }, children: [_jsx("button", { onClick: cancelPicker, style: { flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }), _jsx("button", { onClick: handleModifiersConfirm, style: { flex: 2, height: 40, borderRadius: 10, border: "none", background: "var(--color-ink)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-bg)", fontFamily: "inherit" }, children: "Add to Order" })] })] }) })), showTransfer && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: "Transfer Table" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Move this order to another available table" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto" }, children: availableTables.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: 40, color: "var(--color-ink-3)" }, children: "No available tables" })) : (_jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }, children: availableTables.map((t) => (_jsxs("button", { onClick: () => transferMutation.mutate(t.id), disabled: transferMutation.isPending, style: { padding: "16px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--color-ink)", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "var(--color-bg)", children: [_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-green)" }, children: [_jsx("rect", { x: "3", y: "8", width: "18", height: "10", rx: "1.5" }), _jsx("path", { d: "M1 14h22M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2" })] }), t.name] }, t.id))) })) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: () => setShowTransfer(false), style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) })), showMerge && (_jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }, children: _jsxs("div", { style: { background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }, children: [_jsxs("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 600 }, children: "Merge Table" }), _jsx("div", { style: { fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }, children: "Pull another order's items into this one" })] }), _jsx("div", { className: "scroll", style: { padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: mergeableOrders.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: 40, color: "var(--color-ink-3)" }, children: "No other open orders" })) : mergeableOrders.map((o) => {
                                const tableEntry = (tablesData?.tables ?? []).find((t) => t.id === o.tableId);
                                const label = tableEntry?.name ?? (o.type === "takeaway" ? "Takeaway" : "Order");
                                const qty = o.items.filter((i) => !i.isVoided).reduce((s, i) => s + i.quantity, 0);
                                return (_jsxs("button", { onClick: () => mergeMutation.mutate(o.id), disabled: mergeMutation.isPending, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }, onMouseEnter: (e) => e.currentTarget.style.background = "var(--color-surface-2)", onMouseLeave: (e) => e.currentTarget.style.background = "var(--color-bg)", children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }, children: label }), _jsxs("div", { style: { fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }, children: [qty, " items \u00B7 ", o.type.replace("_", " ")] })] }), _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", style: { color: "var(--color-ink-3)" }, children: _jsx("path", { d: "M9 18l6-6-6-6" }) })] }, o.id));
                            }) }), _jsx("div", { style: { padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }, children: _jsx("button", { onClick: () => setShowMerge(false), style: { width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }, children: "Cancel" }) })] }) }))] }));
}
