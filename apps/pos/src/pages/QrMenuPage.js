import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { useParams } from "@tanstack/react-router";
const SERVER_ORIGIN = window.location.protocol === "tauri:" || window.location.port === "5173"
    ? "http://localhost:3000"
    : "";
const PUBLIC_BASE = `${SERVER_ORIGIN}/api/public`;
function fmt(n) {
    return `₹${Number(n).toFixed(0)}`;
}
function VegDot({ isVeg }) {
    return (_jsx("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, border: `2px solid ${isVeg ? "#1a7a1a" : "#b91c1c"}`, borderRadius: 2, flexShrink: 0 }, children: _jsx("span", { style: { width: 8, height: 8, borderRadius: "50%", background: isVeg ? "#1a7a1a" : "#b91c1c" } }) }));
}
function ModifierModal({ item, onConfirm, onClose }) {
    const hasVariants = item.variants.length > 0;
    const [selectedVariantId, setSelectedVariantId] = useState(item.variants[0]?.id);
    const [selectedMods, setSelectedMods] = useState({});
    const selectedVariant = item.variants.find((v) => v.id === selectedVariantId);
    const basePrice = selectedVariant ? Number(selectedVariant.price) : Number(item.basePrice);
    const modCost = Object.values(selectedMods).flat().reduce((s, mid) => {
        const mod = item.modifierGroups.flatMap((g) => g.modifiers).find((m) => m.id === mid);
        return s + (mod ? Number(mod.price) : 0);
    }, 0);
    const total = basePrice + modCost;
    function toggleMod(groupId, modId, multiSelect) {
        setSelectedMods((prev) => {
            const cur = prev[groupId] ?? [];
            if (cur.includes(modId))
                return { ...prev, [groupId]: cur.filter((id) => id !== modId) };
            return { ...prev, [groupId]: multiSelect ? [...cur, modId] : [modId] };
        });
    }
    function handleConfirm() {
        const allModIds = Object.values(selectedMods).flat();
        const allModNames = allModIds.map((mid) => item.modifierGroups.flatMap((g) => g.modifiers).find((m) => m.id === mid)?.name ?? "");
        onConfirm(selectedVariantId, selectedVariant?.name, total, allModIds, allModNames);
    }
    return (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "flex", alignItems: "flex-end" }, onClick: onClose, children: _jsxs("div", { style: { width: "100%", maxHeight: "80vh", background: "#fff", borderRadius: "20px 20px 0 0", overflowY: "auto", padding: "24px 20px 36px" }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }, children: [_jsx(VegDot, { isVeg: item.isVeg }), _jsx("span", { style: { fontSize: 18, fontWeight: 700, flex: 1 }, children: item.name }), _jsx("button", { onClick: onClose, style: { border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#666", lineHeight: 1 }, children: "\u00D7" })] }), hasVariants && (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }, children: "Size" }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: item.variants.map((v) => (_jsxs("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1.5px solid ${selectedVariantId === v.id ? "#111" : "#e5e5e5"}`, borderRadius: 10, cursor: "pointer" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("input", { type: "radio", name: "variant", checked: selectedVariantId === v.id, onChange: () => setSelectedVariantId(v.id), style: { accentColor: "#111" } }), _jsx("span", { style: { fontSize: 14, fontWeight: 500 }, children: v.name })] }), _jsx("span", { style: { fontSize: 14, fontWeight: 600 }, children: fmt(v.price) })] }, v.id))) })] })), item.modifierGroups.map((group) => (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsxs("div", { style: { fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: ".06em" }, children: [group.name, group.required && _jsx("span", { style: { fontSize: 10, background: "#fee2e2", color: "#b91c1c", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }, children: "Required" })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: group.modifiers.map((mod) => {
                                const checked = (selectedMods[group.id] ?? []).includes(mod.id);
                                return (_jsxs("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1.5px solid ${checked ? "#111" : "#e5e5e5"}`, borderRadius: 10, cursor: "pointer" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("input", { type: group.multiSelect ? "checkbox" : "radio", name: `group-${group.id}`, checked: checked, onChange: () => toggleMod(group.id, mod.id, group.multiSelect), style: { accentColor: "#111" } }), _jsx("span", { style: { fontSize: 14 }, children: mod.name })] }), Number(mod.price) > 0 && _jsxs("span", { style: { fontSize: 13, color: "#555" }, children: ["+", fmt(mod.price)] })] }, mod.id));
                            }) })] }, group.id))), _jsxs("button", { onClick: handleConfirm, style: { width: "100%", padding: "16px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer" }, children: ["Add to cart \u2014 ", fmt(total)] })] }) }));
}
export default function QrMenuPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { outletId, tableId } = useParams({ strict: false });
    const [outlet, setOutlet] = useState(null);
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeCategoryId, setActiveCategoryId] = useState(null);
    const [cart, setCart] = useState([]);
    const [modifierTarget, setModifierTarget] = useState(null);
    const [showCart, setShowCart] = useState(false);
    const [placing, setPlacing] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [orderStatus, setOrderStatus] = useState(null);
    const pollRef = useRef(null);
    useEffect(() => {
        fetch(`${PUBLIC_BASE}/menu/${outletId}`)
            .then((r) => r.json())
            .then((data) => {
            setOutlet(data.outlet);
            setCategories(data.categories);
            setItems(data.items);
            setActiveCategoryId(data.categories[0]?.id ?? null);
        })
            .catch(() => setError("Could not load menu. Please try again."))
            .finally(() => setLoading(false));
    }, [outletId]);
    useEffect(() => () => { if (pollRef.current)
        clearInterval(pollRef.current); }, []);
    function addToCart(item, variantId, variantName, price, modifierIds, modifierNames) {
        const unitPrice = price ?? Number(item.basePrice);
        setCart((prev) => {
            const key = `${item.id}:${variantId ?? ""}:${(modifierIds ?? []).join(",")}`;
            const existing = prev.find((e) => `${e.menuItemId}:${e.variantId ?? ""}:${e.modifierIds.join(",")}` === key);
            if (existing)
                return prev.map((e) => (`${e.menuItemId}:${e.variantId ?? ""}:${e.modifierIds.join(",")}` === key ? { ...e, quantity: e.quantity + 1 } : e));
            return [...prev, { menuItemId: item.id, name: item.name, variantId, variantName, unitPrice, quantity: 1, modifierIds: modifierIds ?? [], modifierNames: modifierNames ?? [] }];
        });
    }
    function changeQty(idx, delta) {
        setCart((prev) => {
            const next = [...prev];
            const entry = next[idx];
            if (entry.quantity + delta <= 0)
                return next.filter((_, i) => i !== idx);
            next[idx] = { ...entry, quantity: entry.quantity + delta };
            return next;
        });
    }
    function handleItemTap(item) {
        if (item.variants.length > 0 || item.modifierGroups.length > 0) {
            setModifierTarget(item);
        }
        else {
            addToCart(item);
        }
    }
    async function placeOrder() {
        if (cart.length === 0 || placing)
            return;
        setPlacing(true);
        try {
            const res = await fetch(`${PUBLIC_BASE}/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    outletId,
                    tableId,
                    items: cart.map((e) => ({
                        menuItemId: e.menuItemId,
                        variantId: e.variantId,
                        quantity: e.quantity,
                        modifierIds: e.modifierIds,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok)
                throw new Error(data.error ?? "Order failed");
            setOrderId(data.orderId);
            setOrderStatus("open");
            setShowCart(false);
            setCart([]);
            pollRef.current = setInterval(async () => {
                try {
                    const s = await fetch(`${PUBLIC_BASE}/orders/${data.orderId}/status?outletId=${outletId}`).then((r) => r.json());
                    setOrderStatus(s.status);
                    if (s.status === "served" || s.status === "billed" || s.status === "cancelled") {
                        clearInterval(pollRef.current);
                    }
                }
                catch { /* ignore poll errors */ }
            }, 5000);
        }
        catch (e) {
            alert(e instanceof Error ? e.message : "Could not place order");
        }
        finally {
            setPlacing(false);
        }
    }
    const cartTotal = cart.reduce((s, e) => s + e.unitPrice * e.quantity, 0);
    const cartCount = cart.reduce((s, e) => s + e.quantity, 0);
    const visibleItems = items.filter((i) => i.categoryId === activeCategoryId);
    // ── Post-order status screen ──
    if (orderId) {
        const STATUS_LABEL = { open: "Order received!", kot_sent: "Being prepared…", served: "Ready — enjoy!", billed: "Billed", cancelled: "Cancelled" };
        const STATUS_COLOR = { open: "#1a7a1a", kot_sent: "#b45309", served: "#1a7a1a", billed: "#555", cancelled: "#b91c1c" };
        const status = orderStatus ?? "open";
        return (_jsxs("div", { style: { minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: "#fafaf9", fontFamily: "system-ui, sans-serif", textAlign: "center" }, children: [_jsx("div", { style: { width: 72, height: 72, borderRadius: "50%", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }, children: _jsx("svg", { width: "36", height: "36", viewBox: "0 0 24 24", fill: "none", stroke: "#1a7a1a", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, marginBottom: 8 }, children: "Order placed!" }), _jsx("div", { style: { fontSize: 16, color: STATUS_COLOR[status] ?? "#555", fontWeight: 600, marginBottom: 6 }, children: STATUS_LABEL[status] ?? status }), _jsx("div", { style: { fontSize: 13, color: "#888", marginBottom: 32 }, children: "We'll update this page as your order progresses." }), (status === "open" || status === "kot_sent") && (_jsx("div", { style: { width: 32, height: 32, borderRadius: "50%", border: "3px solid #e5e5e5", borderTopColor: "#111", animation: "spin 1s linear infinite" } })), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg) } }` })] }));
    }
    if (loading)
        return (_jsxs("div", { style: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }, children: [_jsx("div", { style: { width: 32, height: 32, borderRadius: "50%", border: "3px solid #e5e5e5", borderTopColor: "#111", animation: "spin 1s linear infinite" } }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg) } }` })] }));
    if (error)
        return (_jsx("div", { style: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "system-ui, sans-serif", textAlign: "center", color: "#b91c1c" }, children: error }));
    return (_jsxs("div", { style: { minHeight: "100dvh", background: "#fafaf9", fontFamily: "system-ui, sans-serif", paddingBottom: cart.length > 0 ? 100 : 32 }, children: [_jsxs("div", { style: { background: "#111", color: "#fff", padding: "20px 20px 16px", position: "sticky", top: 0, zIndex: 10 }, children: [_jsx("div", { style: { fontSize: 20, fontWeight: 700 }, children: outlet?.name }), outlet?.address && _jsx("div", { style: { fontSize: 12, opacity: .65, marginTop: 3 }, children: outlet.address })] }), _jsx("div", { style: { display: "flex", gap: 8, padding: "14px 16px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #f0f0f0", scrollbarWidth: "none" }, children: categories.map((cat) => (_jsx("button", { onClick: () => setActiveCategoryId(cat.id), style: { flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1.5px solid " + (activeCategoryId === cat.id ? "#111" : "#e5e5e5"), background: activeCategoryId === cat.id ? "#111" : "#fff", color: activeCategoryId === cat.id ? "#fff" : "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }, children: cat.name }, cat.id))) }), _jsxs("div", { style: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }, children: [visibleItems.length === 0 && (_jsx("div", { style: { textAlign: "center", padding: "48px 0", color: "#aaa", fontSize: 15 }, children: "No items in this category" })), visibleItems.map((item) => {
                        const cartQty = cart.filter((e) => e.menuItemId === item.id).reduce((s, e) => s + e.quantity, 0);
                        const minPrice = item.variants.length > 0 ? Math.min(...item.variants.map((v) => Number(v.price))) : Number(item.basePrice);
                        const hasOptions = item.variants.length > 0 || item.modifierGroups.length > 0;
                        return (_jsxs("div", { style: { display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid #f0f0f0", alignItems: "flex-start" }, children: [item.imageUrl && (_jsx("img", { src: item.imageUrl, alt: item.name, style: { width: 80, height: 80, borderRadius: 10, objectFit: "cover", flexShrink: 0 } })), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }, children: [_jsx(VegDot, { isVeg: item.isVeg }), _jsx("span", { style: { fontSize: 15, fontWeight: 600, color: "#111" }, children: item.name })] }), item.description && _jsx("div", { style: { fontSize: 12, color: "#888", lineHeight: 1.4, marginBottom: 6 }, children: item.description }), _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }, children: [_jsx("span", { style: { fontSize: 15, fontWeight: 700 }, children: hasOptions ? `from ${fmt(minPrice)}` : fmt(minPrice) }), cartQty > 0 && !hasOptions ? (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 0, border: "1.5px solid #111", borderRadius: 8, overflow: "hidden" }, children: [_jsx("button", { onClick: () => { const idx = cart.findIndex((e) => e.menuItemId === item.id); changeQty(idx, -1); }, style: { width: 36, height: 36, border: "none", background: "#111", color: "#fff", fontSize: 18, cursor: "pointer" }, children: "\u2212" }), _jsx("span", { style: { width: 28, textAlign: "center", fontSize: 14, fontWeight: 700 }, children: cartQty }), _jsx("button", { onClick: () => handleItemTap(item), style: { width: 36, height: 36, border: "none", background: "#111", color: "#fff", fontSize: 18, cursor: "pointer" }, children: "+" })] })) : (_jsx("button", { onClick: () => handleItemTap(item), style: { display: "flex", alignItems: "center", gap: 4, padding: "8px 16px", background: cartQty > 0 ? "#111" : "#fff", color: cartQty > 0 ? "#fff" : "#111", border: "1.5px solid #111", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, children: cartQty > 0 ? `+Add (${cartQty})` : hasOptions ? "Customise" : "+ Add" }))] })] })] }, item.id));
                    })] }), modifierTarget && (_jsx(ModifierModal, { item: modifierTarget, onConfirm: (variantId, variantName, price, modifierIds, modifierNames) => {
                    addToCart(modifierTarget, variantId, variantName, price, modifierIds, modifierNames);
                    setModifierTarget(null);
                }, onClose: () => setModifierTarget(null) })), showCart && (_jsx("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100 }, onClick: () => setShowCart(false), children: _jsxs("div", { style: { position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "80vh", overflowY: "auto" }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 20 }, children: "Your order" }), cart.map((entry, idx) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f0f0f0" }, children: [_jsxs("div", { style: { flex: 1 }, children: [_jsxs("div", { style: { fontSize: 14, fontWeight: 600 }, children: [entry.name, entry.variantName ? ` (${entry.variantName})` : ""] }), entry.modifierNames.length > 0 && _jsx("div", { style: { fontSize: 12, color: "#888" }, children: entry.modifierNames.join(", ") })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("button", { onClick: () => changeQty(idx, -1), style: { width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #ddd", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, children: "\u2212" }), _jsx("span", { style: { fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: "center" }, children: entry.quantity }), _jsx("button", { onClick: () => changeQty(idx, 1), style: { width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #ddd", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, children: "+" })] }), _jsx("div", { style: { fontSize: 14, fontWeight: 700, minWidth: 56, textAlign: "right" }, children: fmt(entry.unitPrice * entry.quantity) })] }, idx))), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", padding: "16px 0", fontWeight: 700, fontSize: 16 }, children: [_jsx("span", { children: "Total" }), _jsx("span", { children: fmt(cartTotal) })] }), _jsx("button", { onClick: () => void placeOrder(), disabled: placing, style: { width: "100%", padding: "16px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: placing ? .6 : 1 }, children: placing ? "Placing order…" : "Place order" })] }) })), cart.length > 0 && (_jsx("div", { style: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 20px", background: "#fff", borderTop: "1px solid #f0f0f0", zIndex: 50 }, children: _jsxs("button", { onClick: () => setShowCart(true), style: { width: "100%", padding: "16px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }, children: [_jsx("span", { style: { background: "#fff", color: "#111", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "2px 10px" }, children: cartCount }), _jsx("span", { children: "View Cart" }), _jsx("span", { children: fmt(cartTotal) })] }) }))] }));
}
