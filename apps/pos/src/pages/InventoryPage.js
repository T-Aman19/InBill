import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TopBar } from "@/components/ui/TopBar";
// ── Helpers ───────────────────────────────────────────────────────────────────
const UNITS = ["kg", "g", "L", "mL", "pcs"];
const MOVEMENT_COLORS = {
    purchase: "green",
    sale: "var(--color-ink-3)",
    waste: "red",
    adjustment: "blue",
};
function isLow(i) {
    return Number(i.reorderLevel) > 0 && Number(i.currentStock) <= Number(i.reorderLevel);
}
function field(label, children) {
    return (_jsxs("label", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)" }, children: label }), children] }));
}
function inputStyle(extra) {
    return {
        width: "100%", height: 44, padding: "0 14px",
        border: "1px solid var(--color-line-strong)", borderRadius: 10,
        background: "var(--color-bg)", color: "var(--color-ink)",
        fontSize: 14, outline: "none", fontFamily: "inherit", ...extra,
    };
}
function SlidePanel({ title, onClose, children, footer }) {
    return (_jsxs(_Fragment, { children: [_jsx("div", { onClick: onClose, style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 10 } }), _jsxs("div", { style: { position: "fixed", top: 0, right: 0, bottom: 0, width: 480, background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", boxShadow: "-12px 0 40px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", zIndex: 11 }, children: [_jsxs("div", { style: { padding: "18px 22px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("h3", { style: { margin: 0, fontSize: 17, fontWeight: 600 }, children: title }), _jsx("button", { onClick: onClose, style: { background: "transparent", border: "none", color: "var(--color-ink-3)", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) })] }), _jsx("div", { className: "scroll", style: { flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 18 }, children: children }), _jsx("div", { style: { padding: 18, borderTop: "1px solid var(--color-line)", display: "flex", gap: 10, justifyContent: "flex-end" }, children: footer })] })] }));
}
function Btn({ label, onClick, danger, disabled }) {
    return (_jsx("button", { onClick: onClick, disabled: disabled, style: { padding: "10px 18px", borderRadius: 10, border: danger ? "1px solid #f87171" : "none", background: danger ? "transparent" : "var(--color-ink)", color: danger ? "#ef4444" : "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1, fontFamily: "inherit" }, children: label }));
}
function CancelBtn({ onClose }) {
    return (_jsx("button", { onClick: onClose, style: { padding: "10px 18px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }, children: "Cancel" }));
}
function TabBtn({ id, active, label, badge, onClick }) {
    return (_jsxs("button", { onClick: onClick, style: { padding: "10px 18px", borderRadius: 10, border: "none", background: active ? "var(--color-surface-2)" : "transparent", color: active ? "var(--color-ink)" : "var(--color-ink-3)", fontSize: 14, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", position: "relative", display: "flex", alignItems: "center", gap: 8 }, children: [label, badge != null && badge > 0 && (_jsx("span", { style: { background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }, children: badge }))] }));
}
// ── Ingredients Tab ───────────────────────────────────────────────────────────
function IngredientsTab() {
    const qc = useQueryClient();
    const { data: rows = [] } = useQuery({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() });
    const [panel, setPanel] = useState(null);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("kg");
    const [reorderLevel, setReorderLevel] = useState("");
    const [costPerUnit, setCostPerUnit] = useState("");
    const [adjustDelta, setAdjustDelta] = useState("");
    const [adjustType, setAdjustType] = useState("purchase");
    const [adjustNote, setAdjustNote] = useState("");
    function openCreate() {
        setName("");
        setUnit("kg");
        setReorderLevel("");
        setCostPerUnit("");
        setPanel({ mode: "create" });
    }
    function openEdit(item) {
        setName(item.name);
        setUnit(item.unit);
        setReorderLevel(item.reorderLevel);
        setCostPerUnit(item.costPerUnit);
        setPanel({ mode: "edit", item });
    }
    function openAdjust(item) {
        setAdjustDelta("");
        setAdjustType("purchase");
        setAdjustNote("");
        setPanel({ mode: "adjust", item });
    }
    const createMutation = useMutation({
        mutationFn: (body) => api.inventory.createIngredient(body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null); },
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, body }) => api.inventory.updateIngredient(id, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null); },
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.inventory.deleteIngredient(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
    });
    const adjustMutation = useMutation({
        mutationFn: (body) => api.inventory.createAdjustment(body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); qc.invalidateQueries({ queryKey: ["movements"] }); setPanel(null); },
    });
    function doSave() {
        if (!name.trim())
            return;
        if (panel?.mode === "create") {
            createMutation.mutate({ name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 });
        }
        else if (panel?.mode === "edit" && panel.item) {
            updateMutation.mutate({ id: panel.item.id, body: { name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 } });
        }
    }
    function doAdjust() {
        if (!panel?.item || !adjustDelta)
            return;
        const delta = adjustType === "waste" ? -Math.abs(Number(adjustDelta)) : Number(adjustDelta);
        adjustMutation.mutate({ ingredientId: panel.item.id, type: adjustType, delta, note: adjustNote || undefined });
    }
    const lowCount = rows.filter((r) => r.isActive === "true" && isLow(r)).length;
    return (_jsxs("div", { style: { position: "relative" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }, children: [_jsxs("div", { style: { fontSize: 14, color: "var(--color-ink-3)" }, children: [rows.filter(r => r.isActive === "true").length, " active ingredient", rows.filter(r => r.isActive === "true").length !== 1 ? "s" : "", lowCount > 0 && _jsxs("span", { style: { marginLeft: 10, color: "#ef4444", fontWeight: 600 }, children: [lowCount, " low stock"] })] }), _jsx("button", { onClick: openCreate, style: { background: "var(--color-ink)", color: "var(--color-bg)", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }, children: "+ Add Ingredient" })] }), _jsx("div", { style: { borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, children: [_jsx("thead", { children: _jsx("tr", { style: { background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }, children: ["Name", "Unit", "Stock", "Reorder", "Cost/Unit", ""].map((h) => (_jsx("th", { style: { padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)", whiteSpace: "nowrap" }, children: h }, h))) }) }), _jsxs("tbody", { children: [rows.filter(r => r.isActive === "true").map((r, i) => {
                                    const low = isLow(r);
                                    return (_jsxs("tr", { style: { borderBottom: i < rows.filter(x => x.isActive === "true").length - 1 ? "1px solid var(--color-line)" : "none", background: low ? "rgba(239,68,68,.04)" : undefined }, children: [_jsxs("td", { style: { padding: "12px 16px", fontWeight: 500, color: "var(--color-ink)" }, children: [r.name, low && _jsx("span", { style: { marginLeft: 8, fontSize: 11, color: "#ef4444", fontWeight: 600 }, children: "LOW" })] }), _jsx("td", { style: { padding: "12px 16px", color: "var(--color-ink-2)" }, children: r.unit }), _jsx("td", { style: { padding: "12px 16px", fontFamily: "var(--font-mono)", color: low ? "#ef4444" : "var(--color-ink)", fontWeight: low ? 600 : 400 }, children: Number(r.currentStock).toFixed(2) }), _jsx("td", { style: { padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--color-ink-3)" }, children: Number(r.reorderLevel).toFixed(2) }), _jsxs("td", { style: { padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }, children: ["\u20B9", Number(r.costPerUnit).toFixed(2)] }), _jsxs("td", { style: { padding: "12px 16px", display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => openAdjust(r), style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer", fontFamily: "inherit" }, children: "Adjust" }), _jsx("button", { onClick: () => openEdit(r), style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer", fontFamily: "inherit" }, children: "Edit" }), _jsx("button", { onClick: () => { if (confirm(`Deactivate "${r.name}"?`))
                                                            deleteMutation.mutate(r.id); }, style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }, children: "Remove" })] })] }, r.id));
                                }), rows.filter(r => r.isActive === "true").length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 32, textAlign: "center", color: "var(--color-ink-3)" }, children: "No ingredients yet. Add one to get started." }) }))] })] }) }), panel && (panel.mode === "create" || panel.mode === "edit") && (_jsxs(SlidePanel, { title: panel.mode === "create" ? "Add Ingredient" : "Edit Ingredient", onClose: () => setPanel(null), footer: _jsxs(_Fragment, { children: [_jsx(CancelBtn, { onClose: () => setPanel(null) }), _jsx(Btn, { label: "Save", onClick: doSave, disabled: !name.trim() || createMutation.isPending || updateMutation.isPending })] }), children: [field("Name", _jsx("input", { style: inputStyle(), value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Tomatoes", autoFocus: true })), field("Unit", (_jsx("select", { value: unit, onChange: (e) => setUnit(e.target.value), style: inputStyle(), children: UNITS.map((u) => _jsx("option", { value: u, children: u }, u)) }))), field("Reorder Level", _jsx("input", { style: inputStyle(), type: "number", min: "0", value: reorderLevel, onChange: (e) => setReorderLevel(e.target.value), placeholder: "0" })), field("Cost per Unit (₹)", _jsx("input", { style: inputStyle(), type: "number", min: "0", value: costPerUnit, onChange: (e) => setCostPerUnit(e.target.value), placeholder: "0.00" }))] })), panel?.mode === "adjust" && panel.item && (_jsxs(SlidePanel, { title: `Adjust Stock — ${panel.item.name}`, onClose: () => setPanel(null), footer: _jsxs(_Fragment, { children: [_jsx(CancelBtn, { onClose: () => setPanel(null) }), _jsx(Btn, { label: "Record", onClick: doAdjust, disabled: !adjustDelta || adjustMutation.isPending })] }), children: [_jsxs("div", { style: { padding: "12px 16px", background: "var(--color-surface-2)", borderRadius: 10, fontSize: 14 }, children: ["Current stock: ", _jsxs("strong", { children: [Number(panel.item.currentStock).toFixed(2), " ", panel.item.unit] })] }), field("Movement Type", (_jsxs("select", { value: adjustType, onChange: (e) => setAdjustType(e.target.value), style: inputStyle(), children: [_jsx("option", { value: "purchase", children: "Purchase (add stock)" }), _jsx("option", { value: "waste", children: "Waste (remove stock)" }), _jsx("option", { value: "adjustment", children: "Adjustment (manual correction)" })] }))), field(`Quantity (${panel.item.unit})`, _jsx("input", { style: inputStyle(), type: "number", min: "0", step: "0.001", value: adjustDelta, onChange: (e) => setAdjustDelta(e.target.value), placeholder: "0.000", autoFocus: true })), field("Note (optional)", _jsx("input", { style: inputStyle(), value: adjustNote, onChange: (e) => setAdjustNote(e.target.value), placeholder: "e.g. Weekly purchase" }))] }))] }));
}
// ── Recipes Tab ───────────────────────────────────────────────────────────────
function RecipesTab() {
    const qc = useQueryClient();
    const { data: recipes = [] } = useQuery({ queryKey: ["recipes"], queryFn: () => api.inventory.listRecipes() });
    const { data: menuData } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() });
    const { data: ingredients = [] } = useQuery({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() });
    const [panel, setPanel] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [addRiRecipeId, setAddRiRecipeId] = useState(null);
    const [newMenuItemId, setNewMenuItemId] = useState("");
    const [newNote, setNewNote] = useState("");
    const [riIngredientId, setRiIngredientId] = useState("");
    const [riQty, setRiQty] = useState("");
    const menuItems = menuData?.items ?? [];
    const linkedMenuItemIds = new Set(recipes.map((r) => r.menuItemId));
    const unlinkedItems = menuItems.filter((m) => !linkedMenuItemIds.has(m.id));
    const createMutation = useMutation({
        mutationFn: (body) => api.inventory.createRecipe(body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setPanel(null); setNewMenuItemId(""); setNewNote(""); },
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.inventory.deleteRecipe(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setExpanded(null); },
    });
    const addRiMutation = useMutation({
        mutationFn: ({ recipeId, body }) => api.inventory.addRecipeIngredient(recipeId, body),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setAddRiRecipeId(null); setRiIngredientId(""); setRiQty(""); },
    });
    const deleteRiMutation = useMutation({
        mutationFn: ({ recipeId, riId }) => api.inventory.deleteRecipeIngredient(recipeId, riId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
    });
    return (_jsxs("div", { style: { position: "relative" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }, children: [_jsxs("div", { style: { fontSize: 14, color: "var(--color-ink-3)" }, children: [recipes.length, " recipe", recipes.length !== 1 ? "s" : "", " defined"] }), _jsx("button", { onClick: () => { setNewMenuItemId(unlinkedItems[0]?.id ?? ""); setNewNote(""); setPanel({ mode: "create" }); }, disabled: unlinkedItems.length === 0, style: { background: "var(--color-ink)", color: "var(--color-bg)", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: unlinkedItems.length === 0 ? "not-allowed" : "pointer", opacity: unlinkedItems.length === 0 ? .4 : 1, fontFamily: "inherit" }, children: "+ Add Recipe" })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [recipes.map((r) => (_jsxs("div", { style: { borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }, children: [_jsxs("div", { onClick: () => setExpanded(expanded === r.id ? null : r.id), style: { padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: expanded === r.id ? "var(--color-surface-2)" : "var(--color-surface)" }, children: [_jsxs("div", { children: [_jsx("span", { style: { fontWeight: 600, fontSize: 14 }, children: r.menuItem?.name ?? "Unknown item" }), _jsxs("span", { style: { marginLeft: 12, fontSize: 12, color: "var(--color-ink-3)" }, children: [r.recipeIngredients.length, " ingredient", r.recipeIngredients.length !== 1 ? "s" : ""] })] }), _jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", style: { transform: expanded === r.id ? "rotate(180deg)" : "none", transition: "transform .15s" }, children: _jsx("path", { d: "M6 9l6 6 6-6" }) })] }), expanded === r.id && (_jsxs("div", { style: { padding: "14px 18px", borderTop: "1px solid var(--color-line)" }, children: [r.note && _jsx("p", { style: { margin: "0 0 12px", fontSize: 13, color: "var(--color-ink-3)", fontStyle: "italic" }, children: r.note }), _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--color-ink-3)" }, children: [_jsx("th", { style: { textAlign: "left", padding: "4px 0", fontWeight: 500 }, children: "Ingredient" }), _jsx("th", { style: { textAlign: "right", padding: "4px 0", fontWeight: 500 }, children: "Qty" }), _jsx("th", { style: { textAlign: "right", padding: "4px 0", fontWeight: 500 }, children: "Unit" }), _jsx("th", { style: { padding: "4px 0" } })] }) }), _jsx("tbody", { children: r.recipeIngredients.map((ri) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: "6px 0", color: "var(--color-ink)" }, children: ri.ingredient?.name ?? "?" }), _jsx("td", { style: { padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }, children: Number(ri.quantity).toFixed(3) }), _jsx("td", { style: { padding: "6px 0", textAlign: "right", color: "var(--color-ink-3)" }, children: ri.ingredient?.unit }), _jsx("td", { style: { padding: "6px 0", textAlign: "right" }, children: _jsx("button", { onClick: () => { if (confirm("Remove this ingredient from recipe?"))
                                                                    deleteRiMutation.mutate({ recipeId: r.id, riId: ri.id }); }, style: { fontSize: 11, padding: "3px 8px", border: "1px solid #fca5a5", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer" }, children: "\u00D7" }) })] }, ri.id))) })] }), addRiRecipeId === r.id ? (_jsxs("div", { style: { marginTop: 12, padding: 14, background: "var(--color-surface-2)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }, children: [_jsxs("select", { value: riIngredientId, onChange: (e) => setRiIngredientId(e.target.value), style: { height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit" }, children: [_jsx("option", { value: "", children: "Select ingredient\u2026" }), ingredients.filter(i => i.isActive === "true").map((i) => _jsxs("option", { value: i.id, children: [i.name, " (", i.unit, ")"] }, i.id))] }), _jsx("input", { type: "number", min: "0.001", step: "0.001", value: riQty, onChange: (e) => setRiQty(e.target.value), placeholder: "Quantity per serving", style: { height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit", outline: "none" } }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => setAddRiRecipeId(null), style: { flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", fontSize: 13, cursor: "pointer" }, children: "Cancel" }), _jsx("button", { onClick: () => riIngredientId && riQty && addRiMutation.mutate({ recipeId: r.id, body: { ingredientId: riIngredientId, quantity: Number(riQty) } }), disabled: !riIngredientId || !riQty, style: { flex: 1, height: 36, borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer" }, children: "Add" })] })] })) : (_jsxs("div", { style: { marginTop: 12, display: "flex", gap: 8 }, children: [_jsx("button", { onClick: () => { setRiIngredientId(""); setRiQty(""); setAddRiRecipeId(r.id); }, style: { fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer" }, children: "+ Add Ingredient" }), _jsx("button", { onClick: () => { if (confirm("Delete this recipe?"))
                                                    deleteMutation.mutate(r.id); }, style: { fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#ef4444", cursor: "pointer" }, children: "Delete Recipe" })] }))] }))] }, r.id))), recipes.length === 0 && (_jsx("div", { style: { padding: 40, textAlign: "center", color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 12 }, children: "No recipes yet. Link ingredients to menu items to enable auto-deduction." }))] }), panel?.mode === "create" && (_jsxs(SlidePanel, { title: "Add Recipe", onClose: () => setPanel(null), footer: _jsxs(_Fragment, { children: [_jsx(CancelBtn, { onClose: () => setPanel(null) }), _jsx(Btn, { label: "Create", onClick: () => newMenuItemId && createMutation.mutate({ menuItemId: newMenuItemId, note: newNote || undefined }), disabled: !newMenuItemId || createMutation.isPending })] }), children: [field("Menu Item", (_jsxs("select", { value: newMenuItemId, onChange: (e) => setNewMenuItemId(e.target.value), style: inputStyle(), children: [_jsx("option", { value: "", children: "Select item\u2026" }), unlinkedItems.map((m) => _jsx("option", { value: m.id, children: m.name }, m.id))] }))), field("Note (optional)", _jsx("input", { style: inputStyle(), value: newNote, onChange: (e) => setNewNote(e.target.value), placeholder: "e.g. Standard portion" })), _jsx("p", { style: { fontSize: 12, color: "var(--color-ink-3)", margin: 0 }, children: "After creating, add ingredients to the recipe." })] }))] }));
}
// ── Movements Tab ─────────────────────────────────────────────────────────────
function MovementsTab() {
    const [typeFilter, setTypeFilter] = useState("all");
    const { data: rows = [] } = useQuery({
        queryKey: ["movements"],
        queryFn: () => api.inventory.listMovements(100),
    });
    const filtered = typeFilter === "all" ? rows : rows.filter((r) => r.type === typeFilter);
    return (_jsxs("div", { children: [_jsx("div", { style: { display: "flex", gap: 8, marginBottom: 20 }, children: ["all", "purchase", "sale", "waste", "adjustment"].map((t) => (_jsx("button", { onClick: () => setTypeFilter(t), style: { padding: "7px 16px", borderRadius: 20, border: "1px solid " + (typeFilter === t ? "var(--color-ink)" : "var(--color-line)"), background: typeFilter === t ? "var(--color-ink)" : "transparent", color: typeFilter === t ? "var(--color-bg)" : "var(--color-ink-3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }, children: t }, t))) }), _jsx("div", { style: { borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 }, children: [_jsx("thead", { children: _jsx("tr", { style: { background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }, children: ["Ingredient", "Type", "Delta", "Note", "By", "Date"].map((h) => (_jsx("th", { style: { padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)" }, children: h }, h))) }) }), _jsxs("tbody", { children: [filtered.map((m, i) => {
                                    const delta = Number(m.delta);
                                    return (_jsxs("tr", { style: { borderBottom: i < filtered.length - 1 ? "1px solid var(--color-line)" : "none" }, children: [_jsx("td", { style: { padding: "11px 16px", fontWeight: 500 }, children: m.ingredient?.name ?? "—" }), _jsx("td", { style: { padding: "11px 16px" }, children: _jsx("span", { style: { padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "var(--color-surface-2)", color: MOVEMENT_COLORS[m.type], textTransform: "capitalize" }, children: m.type }) }), _jsxs("td", { style: { padding: "11px 16px", fontFamily: "var(--font-mono)", color: delta >= 0 ? "#16a34a" : "#ef4444", fontWeight: 600 }, children: [delta >= 0 ? "+" : "", delta.toFixed(3), " ", m.ingredient?.unit ?? ""] }), _jsx("td", { style: { padding: "11px 16px", color: "var(--color-ink-3)" }, children: m.note ?? "—" }), _jsx("td", { style: { padding: "11px 16px", color: "var(--color-ink-3)" }, children: m.recordedBy?.name ?? "system" }), _jsx("td", { style: { padding: "11px 16px", color: "var(--color-ink-3)", whiteSpace: "nowrap" }, children: new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) })] }, m.id));
                                }), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, style: { padding: 32, textAlign: "center", color: "var(--color-ink-3)" }, children: "No movements found." }) }))] })] }) })] }));
}
export default function InventoryPage() {
    const [tab, setTab] = useState("ingredients");
    const { data: ingredients = [] } = useQuery({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() });
    const lowCount = ingredients.filter((i) => i.isActive === "true" && isLow(i)).length;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }, children: [_jsx(TopBar, { current: "inventory" }), _jsx("div", { style: { flex: 1, overflow: "auto", padding: "28px 32px" }, children: _jsxs("div", { style: { maxWidth: 1100, margin: "0 auto" }, children: [_jsx("h1", { style: { fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: "var(--color-ink)" }, children: "Inventory" }), _jsxs("div", { style: { display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--color-line)", paddingBottom: 0 }, children: [_jsx(TabBtn, { id: "ingredients", label: "Ingredients", active: tab === "ingredients", badge: lowCount, onClick: () => setTab("ingredients") }), _jsx(TabBtn, { id: "recipes", label: "Recipes", active: tab === "recipes", onClick: () => setTab("recipes") }), _jsx(TabBtn, { id: "movements", label: "Stock Movements", active: tab === "movements", onClick: () => setTab("movements") })] }), tab === "ingredients" && _jsx(IngredientsTab, {}), tab === "recipes" && _jsx(RecipesTab, {}), tab === "movements" && _jsx(MovementsTab, {})] }) })] }));
}
