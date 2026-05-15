import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { TopBar } from "@/components/ui/TopBar"

// ── Types ─────────────────────────────────────────────────────────────────────
type Unit = "kg" | "g" | "L" | "mL" | "pcs"
type MovementType = "purchase" | "sale" | "waste" | "adjustment"

type Ingredient = {
  id: string
  name: string
  unit: Unit
  currentStock: string
  reorderLevel: string
  costPerUnit: string
  isActive: string
}

type RecipeIngredient = {
  id: string
  recipeId: string
  ingredientId: string
  quantity: string
  ingredient: Ingredient
}

type Recipe = {
  id: string
  menuItemId: string
  note: string | null
  menuItem: { id: string; name: string; categoryId: string }
  recipeIngredients: RecipeIngredient[]
}

type Movement = {
  id: string
  ingredientId: string
  type: MovementType
  delta: string
  note: string | null
  createdAt: string
  ingredient: { id: string; name: string; unit: Unit }
  recordedBy: { id: string; name: string } | null
}

type MenuItemRow = { id: string; name: string; categoryId: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const UNITS: Unit[] = ["kg", "g", "L", "mL", "pcs"]
const MOVEMENT_COLORS: Record<MovementType, string> = {
  purchase: "green",
  sale: "var(--color-ink-3)",
  waste: "red",
  adjustment: "blue",
}

function isLow(i: Ingredient) {
  return Number(i.reorderLevel) > 0 && Number(i.currentStock) <= Number(i.reorderLevel)
}

function field(label: string, children: React.ReactNode) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)" }}>{label}</span>
      {children}
    </label>
  )
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%", height: 44, padding: "0 14px",
    border: "1px solid var(--color-line-strong)", borderRadius: 10,
    background: "var(--color-bg)", color: "var(--color-ink)",
    fontSize: 14, outline: "none", fontFamily: "inherit", ...extra,
  }
}

function SlidePanel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 480, background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", boxShadow: "-12px 0 40px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", zIndex: 11 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--color-ink-3)", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>
        <div style={{ padding: 18, borderTop: "1px solid var(--color-line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>{footer}</div>
      </div>
    </>
  )
}

function Btn({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 18px", borderRadius: 10, border: danger ? "1px solid #f87171" : "none", background: danger ? "transparent" : "var(--color-ink)", color: danger ? "#ef4444" : "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1, fontFamily: "inherit" }}>
      {label}
    </button>
  )
}

function CancelBtn({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
      Cancel
    </button>
  )
}

function TabBtn({ id, active, label, badge, onClick }: { id: string; active: boolean; label: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: active ? "var(--color-surface-2)" : "transparent", color: active ? "var(--color-ink)" : "var(--color-ink-3)", fontSize: 14, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      {label}
      {badge != null && badge > 0 && (
        <span style={{ background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>{badge}</span>
      )}
    </button>
  )
}

// ── Ingredients Tab ───────────────────────────────────────────────────────────
function IngredientsTab() {
  const qc = useQueryClient()
  const { data: rows = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })
  const [panel, setPanel] = useState<{ mode: "create" | "edit" | "adjust"; item?: Ingredient } | null>(null)

  const [name, setName] = useState("")
  const [unit, setUnit] = useState<Unit>("kg")
  const [reorderLevel, setReorderLevel] = useState("")
  const [costPerUnit, setCostPerUnit] = useState("")
  const [adjustDelta, setAdjustDelta] = useState("")
  const [adjustType, setAdjustType] = useState<"purchase" | "waste" | "adjustment">("purchase")
  const [adjustNote, setAdjustNote] = useState("")

  function openCreate() {
    setName(""); setUnit("kg"); setReorderLevel(""); setCostPerUnit("")
    setPanel({ mode: "create" })
  }
  function openEdit(item: Ingredient) {
    setName(item.name); setUnit(item.unit); setReorderLevel(item.reorderLevel); setCostPerUnit(item.costPerUnit)
    setPanel({ mode: "edit", item })
  }
  function openAdjust(item: Ingredient) {
    setAdjustDelta(""); setAdjustType("purchase"); setAdjustNote("")
    setPanel({ mode: "adjust", item })
  }

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.inventory.createIngredient(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.inventory.updateIngredient(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.inventory.deleteIngredient(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  })
  const adjustMutation = useMutation({
    mutationFn: (body: unknown) => api.inventory.createAdjustment(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); qc.invalidateQueries({ queryKey: ["movements"] }); setPanel(null) },
  })

  function doSave() {
    if (!name.trim()) return
    if (panel?.mode === "create") {
      createMutation.mutate({ name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 })
    } else if (panel?.mode === "edit" && panel.item) {
      updateMutation.mutate({ id: panel.item.id, body: { name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 } })
    }
  }

  function doAdjust() {
    if (!panel?.item || !adjustDelta) return
    const delta = adjustType === "waste" ? -Math.abs(Number(adjustDelta)) : Number(adjustDelta)
    adjustMutation.mutate({ ingredientId: panel.item.id, type: adjustType, delta, note: adjustNote || undefined })
  }

  const lowCount = rows.filter((r) => r.isActive === "true" && isLow(r)).length

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "var(--color-ink-3)" }}>
          {rows.filter(r => r.isActive === "true").length} active ingredient{rows.filter(r => r.isActive === "true").length !== 1 ? "s" : ""}
          {lowCount > 0 && <span style={{ marginLeft: 10, color: "#ef4444", fontWeight: 600 }}>{lowCount} low stock</span>}
        </div>
        <button onClick={openCreate} style={{ background: "var(--color-ink)", color: "var(--color-bg)", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Ingredient
        </button>
      </div>

      <div style={{ borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
              {["Name", "Unit", "Stock", "Reorder", "Cost/Unit", ""].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter(r => r.isActive === "true").map((r, i) => {
              const low = isLow(r)
              return (
                <tr key={r.id} style={{ borderBottom: i < rows.filter(x => x.isActive === "true").length - 1 ? "1px solid var(--color-line)" : "none", background: low ? "rgba(239,68,68,.04)" : undefined }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500, color: "var(--color-ink)" }}>
                    {r.name}
                    {low && <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>LOW</span>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--color-ink-2)" }}>{r.unit}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: low ? "#ef4444" : "var(--color-ink)", fontWeight: low ? 600 : 400 }}>
                    {Number(r.currentStock).toFixed(2)}
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--color-ink-3)" }}>{Number(r.reorderLevel).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>₹{Number(r.costPerUnit).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
                    <button onClick={() => openAdjust(r)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer", fontFamily: "inherit" }}>Adjust</button>
                    <button onClick={() => openEdit(r)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                    <button onClick={() => { if (confirm(`Deactivate "${r.name}"?`)) deleteMutation.mutate(r.id) }} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#ef4444", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                  </td>
                </tr>
              )
            })}
            {rows.filter(r => r.isActive === "true").length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)" }}>No ingredients yet. Add one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Panel */}
      {panel && (panel.mode === "create" || panel.mode === "edit") && (
        <SlidePanel title={panel.mode === "create" ? "Add Ingredient" : "Edit Ingredient"} onClose={() => setPanel(null)} footer={<><CancelBtn onClose={() => setPanel(null)} /><Btn label="Save" onClick={doSave} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending} /></>}>
          {field("Name", <input style={inputStyle()} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tomatoes" autoFocus />)}
          {field("Unit", (
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} style={inputStyle()}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ))}
          {field("Reorder Level", <input style={inputStyle()} type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="0" />)}
          {field("Cost per Unit (₹)", <input style={inputStyle()} type="number" min="0" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} placeholder="0.00" />)}
        </SlidePanel>
      )}

      {/* Adjust Panel */}
      {panel?.mode === "adjust" && panel.item && (
        <SlidePanel title={`Adjust Stock — ${panel.item.name}`} onClose={() => setPanel(null)} footer={<><CancelBtn onClose={() => setPanel(null)} /><Btn label="Record" onClick={doAdjust} disabled={!adjustDelta || adjustMutation.isPending} /></>}>
          <div style={{ padding: "12px 16px", background: "var(--color-surface-2)", borderRadius: 10, fontSize: 14 }}>
            Current stock: <strong>{Number(panel.item.currentStock).toFixed(2)} {panel.item.unit}</strong>
          </div>
          {field("Movement Type", (
            <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as typeof adjustType)} style={inputStyle()}>
              <option value="purchase">Purchase (add stock)</option>
              <option value="waste">Waste (remove stock)</option>
              <option value="adjustment">Adjustment (manual correction)</option>
            </select>
          ))}
          {field(`Quantity (${panel.item.unit})`, <input style={inputStyle()} type="number" min="0" step="0.001" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="0.000" autoFocus />)}
          {field("Note (optional)", <input style={inputStyle()} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. Weekly purchase" />)}
        </SlidePanel>
      )}
    </div>
  )
}

// ── Recipes Tab ───────────────────────────────────────────────────────────────
function RecipesTab() {
  const qc = useQueryClient()
  const { data: recipes = [] } = useQuery<Recipe[]>({ queryKey: ["recipes"], queryFn: () => api.inventory.listRecipes() as Promise<Recipe[]> })
  const { data: menuData } = useQuery<{ items: MenuItemRow[] }>({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ items: MenuItemRow[] }> })
  const { data: ingredients = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })

  const [panel, setPanel] = useState<{ mode: "create" } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addRiRecipeId, setAddRiRecipeId] = useState<string | null>(null)
  const [newMenuItemId, setNewMenuItemId] = useState("")
  const [newNote, setNewNote] = useState("")
  const [riIngredientId, setRiIngredientId] = useState("")
  const [riQty, setRiQty] = useState("")

  const menuItems: MenuItemRow[] = menuData?.items ?? []
  const linkedMenuItemIds = new Set(recipes.map((r) => r.menuItemId))
  const unlinkedItems = menuItems.filter((m) => !linkedMenuItemIds.has(m.id))

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.inventory.createRecipe(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setPanel(null); setNewMenuItemId(""); setNewNote("") },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.inventory.deleteRecipe(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setExpanded(null) },
  })
  const addRiMutation = useMutation({
    mutationFn: ({ recipeId, body }: { recipeId: string; body: unknown }) => api.inventory.addRecipeIngredient(recipeId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setAddRiRecipeId(null); setRiIngredientId(""); setRiQty("") },
  })
  const deleteRiMutation = useMutation({
    mutationFn: ({ recipeId, riId }: { recipeId: string; riId: string }) => api.inventory.deleteRecipeIngredient(recipeId, riId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  })

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: "var(--color-ink-3)" }}>{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} defined</div>
        <button onClick={() => { setNewMenuItemId(unlinkedItems[0]?.id ?? ""); setNewNote(""); setPanel({ mode: "create" }) }} disabled={unlinkedItems.length === 0} style={{ background: "var(--color-ink)", color: "var(--color-bg)", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: unlinkedItems.length === 0 ? "not-allowed" : "pointer", opacity: unlinkedItems.length === 0 ? .4 : 1, fontFamily: "inherit" }}>
          + Add Recipe
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recipes.map((r) => (
          <div key={r.id} style={{ borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }}>
            <div
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: expanded === r.id ? "var(--color-surface-2)" : "var(--color-surface)" }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.menuItem?.name ?? "Unknown item"}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: "var(--color-ink-3)" }}>{r.recipeIngredients.length} ingredient{r.recipeIngredients.length !== 1 ? "s" : ""}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded === r.id ? "rotate(180deg)" : "none", transition: "transform .15s" }}><path d="M6 9l6 6 6-6"/></svg>
            </div>

            {expanded === r.id && (
              <div style={{ padding: "14px 18px", borderTop: "1px solid var(--color-line)" }}>
                {r.note && <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-ink-3)", fontStyle: "italic" }}>{r.note}</p>}

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--color-ink-3)" }}>
                      <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 500 }}>Ingredient</th>
                      <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 500 }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 500 }}>Unit</th>
                      <th style={{ padding: "4px 0" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.recipeIngredients.map((ri) => (
                      <tr key={ri.id}>
                        <td style={{ padding: "6px 0", color: "var(--color-ink)" }}>{ri.ingredient?.name ?? "?"}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "var(--font-mono)" }}>{Number(ri.quantity).toFixed(3)}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", color: "var(--color-ink-3)" }}>{ri.ingredient?.unit}</td>
                        <td style={{ padding: "6px 0", textAlign: "right" }}>
                          <button onClick={() => { if (confirm("Remove this ingredient from recipe?")) deleteRiMutation.mutate({ recipeId: r.id, riId: ri.id }) }} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid #fca5a5", borderRadius: 6, background: "transparent", color: "#ef4444", cursor: "pointer" }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {addRiRecipeId === r.id ? (
                  <div style={{ marginTop: 12, padding: 14, background: "var(--color-surface-2)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                    <select value={riIngredientId} onChange={(e) => setRiIngredientId(e.target.value)} style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit" }}>
                      <option value="">Select ingredient…</option>
                      {ingredients.filter(i => i.isActive === "true").map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <input type="number" min="0.001" step="0.001" value={riQty} onChange={(e) => setRiQty(e.target.value)} placeholder="Quantity per serving" style={{ height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setAddRiRecipeId(null)} style={{ flex: 1, height: 36, borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => riIngredientId && riQty && addRiMutation.mutate({ recipeId: r.id, body: { ingredientId: riIngredientId, quantity: Number(riQty) } })} disabled={!riIngredientId || !riQty} style={{ flex: 1, height: 36, borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button onClick={() => { setRiIngredientId(""); setRiQty(""); setAddRiRecipeId(r.id) }} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink)", cursor: "pointer" }}>+ Add Ingredient</button>
                    <button onClick={() => { if (confirm("Delete this recipe?")) deleteMutation.mutate(r.id) }} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Delete Recipe</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {recipes.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 12 }}>
            No recipes yet. Link ingredients to menu items to enable auto-deduction.
          </div>
        )}
      </div>

      {panel?.mode === "create" && (
        <SlidePanel title="Add Recipe" onClose={() => setPanel(null)} footer={<><CancelBtn onClose={() => setPanel(null)} /><Btn label="Create" onClick={() => newMenuItemId && createMutation.mutate({ menuItemId: newMenuItemId, note: newNote || undefined })} disabled={!newMenuItemId || createMutation.isPending} /></>}>
          {field("Menu Item", (
            <select value={newMenuItemId} onChange={(e) => setNewMenuItemId(e.target.value)} style={inputStyle()}>
              <option value="">Select item…</option>
              {unlinkedItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ))}
          {field("Note (optional)", <input style={inputStyle()} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="e.g. Standard portion" />)}
          <p style={{ fontSize: 12, color: "var(--color-ink-3)", margin: 0 }}>After creating, add ingredients to the recipe.</p>
        </SlidePanel>
      )}
    </div>
  )
}

// ── Movements Tab ─────────────────────────────────────────────────────────────
function MovementsTab() {
  const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all")
  const { data: rows = [] } = useQuery<Movement[]>({
    queryKey: ["movements"],
    queryFn: () => api.inventory.listMovements(100) as Promise<Movement[]>,
  })

  const filtered = typeFilter === "all" ? rows : rows.filter((r) => r.type === typeFilter)

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["all", "purchase", "sale", "waste", "adjustment"] as const).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: "7px 16px", borderRadius: 20, border: "1px solid " + (typeFilter === t ? "var(--color-ink)" : "var(--color-line)"), background: typeFilter === t ? "var(--color-ink)" : "transparent", color: typeFilter === t ? "var(--color-bg)" : "var(--color-ink-3)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 12, border: "1px solid var(--color-line)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
              {["Ingredient", "Type", "Delta", "Note", "By", "Date"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--color-ink-3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => {
              const delta = Number(m.delta)
              return (
                <tr key={m.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                  <td style={{ padding: "11px 16px", fontWeight: 500 }}>{m.ingredient?.name ?? "—"}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "var(--color-surface-2)", color: MOVEMENT_COLORS[m.type], textTransform: "capitalize" }}>{m.type}</span>
                  </td>
                  <td style={{ padding: "11px 16px", fontFamily: "var(--font-mono)", color: delta >= 0 ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(3)} {m.ingredient?.unit ?? ""}
                  </td>
                  <td style={{ padding: "11px 16px", color: "var(--color-ink-3)" }}>{m.note ?? "—"}</td>
                  <td style={{ padding: "11px 16px", color: "var(--color-ink-3)" }}>{m.recordedBy?.name ?? "system"}</td>
                  <td style={{ padding: "11px 16px", color: "var(--color-ink-3)", whiteSpace: "nowrap" }}>
                    {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)" }}>No movements found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = "ingredients" | "recipes" | "movements"

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("ingredients")
  const { data: ingredients = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })
  const lowCount = ingredients.filter((i) => i.isActive === "true" && isLow(i)).length

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }}>
      <TopBar current="inventory" />

      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 24px", color: "var(--color-ink)" }}>Inventory</h1>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--color-line)", paddingBottom: 0 }}>
            <TabBtn id="ingredients" label="Ingredients" active={tab === "ingredients"} badge={lowCount} onClick={() => setTab("ingredients")} />
            <TabBtn id="recipes" label="Recipes" active={tab === "recipes"} onClick={() => setTab("recipes")} />
            <TabBtn id="movements" label="Stock Movements" active={tab === "movements"} onClick={() => setTab("movements")} />
          </div>

          {tab === "ingredients" && <IngredientsTab />}
          {tab === "recipes" && <RecipesTab />}
          {tab === "movements" && <MovementsTab />}
        </div>
      </div>
    </div>
  )
}
