import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@/lib/api"
import { TopBar } from "@/components/ui/TopBar"

// ── Types ─────────────────────────────────────────────────────────────────────
type Unit = "kg" | "g" | "L" | "mL" | "pcs"
type MovementType = "purchase" | "sale" | "waste" | "adjustment"

type Ingredient = {
  id: string; name: string; unit: Unit
  currentStock: string; reorderLevel: string; costPerUnit: string; isActive: string
}
type RecipeIngredient = {
  id: string; recipeId: string; ingredientId: string; quantity: string; ingredient: Ingredient
}
type Recipe = {
  id: string; menuItemId: string; note: string | null
  menuItem: { id: string; name: string; categoryId: string }
  recipeIngredients: RecipeIngredient[]
}
type Movement = {
  id: string; ingredientId: string; type: MovementType; delta: string; note: string | null
  createdAt: string; ingredient: { id: string; name: string; unit: Unit }
  recordedBy: { id: string; name: string } | null
}
type MenuItemRow = { id: string; name: string; categoryId: string }
type Vendor = {
  id: string; name: string; phone?: string | null; email?: string | null
  gstin?: string | null; address?: string | null; isActive: boolean
  openPOCount: number; lastPOAt: string | null
}
type POStatus = "draft" | "ordered" | "partial" | "received"
type POListItem = {
  id: string; vendorId: string; status: POStatus; notes: string | null
  totalAmount: string; expectedAt: string | null; receivedAt: string | null
  createdAt: string; itemCount: number
  vendor: { id: string; name: string; phone?: string | null }
}
type POLineInput = { ingredientId: string; orderedQty: number; unitCost: number }

// ── Helpers ───────────────────────────────────────────────────────────────────
const UNITS: Unit[] = ["kg", "g", "L", "mL", "pcs"]

function isLow(i: Ingredient) {
  return Number(i.reorderLevel) > 0 && Number(i.currentStock) <= Number(i.reorderLevel)
}
function isOut(i: Ingredient) { return Number(i.currentStock) <= 0 }

function iStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%", height: 34, padding: "0 12px",
    border: "1px solid var(--color-line-strong)", borderRadius: 8,
    background: "var(--color-surface)", color: "var(--color-ink)",
    fontSize: 13, outline: "none", fontFamily: "inherit", ...extra,
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const I = {
  search:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  plus:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  alert:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  x:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  trash:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  sparkle:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9 2 12l7 3 3 7 3-7 7-3-7-3z"/></svg>,
  more:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>,
  phone:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 01-2.2 2A19.8 19.8 0 013.1 4.2 2 2 0 015 2h3a2 2 0 012 1.7c.1.8.3 1.5.5 2.2a2 2 0 01-.5 2L8.9 9a16 16 0 006.1 6.1l1.1-1.1a2 2 0 012-.5c.7.2 1.4.4 2.2.5A2 2 0 0122 16.9z"/></svg>,
  mail:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  file:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  cal:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  chevR:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  chevD:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
}

// ── SlidePanel ────────────────────────────────────────────────────────────────
function SlidePanel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 10 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 480, background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", boxShadow: "-12px 0 40px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", zIndex: 11 }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--color-ink-3)", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}>{I.x}</button>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
        <div style={{ padding: 18, borderTop: "1px solid var(--color-line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>{footer}</div>
      </div>
    </>
  )
}

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-ink-3)" }}>{label}</span>
      {children}
    </label>
  )
}

// ── Ingredients Tab ───────────────────────────────────────────────────────────
function IngredientsTab() {
  const qc = useQueryClient()
  const { data: rows = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => api.vendors.list() as Promise<Vendor[]> })
  const [panel, setPanel] = useState<{ mode: "create" | "edit" | "adjust"; item?: Ingredient } | null>(null)
  const [search, setSearch] = useState("")
  const [name, setName] = useState("")
  const [unit, setUnit] = useState<Unit>("kg")
  const [reorderLevel, setReorderLevel] = useState("")
  const [costPerUnit, setCostPerUnit] = useState("")
  const [adjustDelta, setAdjustDelta] = useState("")
  const [adjustType, setAdjustType] = useState<"purchase" | "waste" | "adjustment">("purchase")
  const [adjustNote, setAdjustNote] = useState("")

  // Low-stock quick PO state
  const [lowPOOpen, setLowPOOpen] = useState(false)
  const [lowPOVendorId, setLowPOVendorId] = useState("")
  const [lowPOLines, setLowPOLines] = useState<POLineInput[]>([])

  function openCreate() { setName(""); setUnit("kg"); setReorderLevel(""); setCostPerUnit(""); setPanel({ mode: "create" }) }
  function openEdit(item: Ingredient) { setName(item.name); setUnit(item.unit); setReorderLevel(item.reorderLevel); setCostPerUnit(item.costPerUnit); setPanel({ mode: "edit", item }) }
  function openAdjust(item: Ingredient) { setAdjustDelta(""); setAdjustType("purchase"); setAdjustNote(""); setPanel({ mode: "adjust", item }) }

  function openLowStockPO() {
    const lowItems = active.filter(r => isLow(r) || isOut(r))
    setLowPOLines(lowItems.map(r => ({
      ingredientId: r.id,
      orderedQty: Math.max(1, Number(r.reorderLevel) - Number(r.currentStock)),
      unitCost: Number(r.costPerUnit) || 0,
    })))
    setLowPOVendorId(vendors[0]?.id ?? "")
    setLowPOOpen(true)
  }

  const createMutation = useMutation({ mutationFn: (b: unknown) => api.inventory.createIngredient(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null) } })
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: unknown }) => api.inventory.updateIngredient(id, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); setPanel(null) } })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.inventory.deleteIngredient(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }) })
  const adjustMutation = useMutation({ mutationFn: (b: unknown) => api.inventory.createAdjustment(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ingredients"] }); qc.invalidateQueries({ queryKey: ["movements"] }); setPanel(null) } })
  const createPOMutation = useMutation({
    mutationFn: (b: unknown) => api.purchaseOrders.create(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); setLowPOOpen(false) },
  })

  function doSave() {
    if (!name.trim()) return
    if (panel?.mode === "create") createMutation.mutate({ name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 })
    else if (panel?.mode === "edit" && panel.item) updateMutation.mutate({ id: panel.item.id, body: { name: name.trim(), unit, reorderLevel: Number(reorderLevel) || 0, costPerUnit: Number(costPerUnit) || 0 } })
  }
  function doAdjust() {
    if (!panel?.item || !adjustDelta) return
    const delta = adjustType === "waste" ? -Math.abs(Number(adjustDelta)) : Number(adjustDelta)
    adjustMutation.mutate({ ingredientId: panel.item.id, type: adjustType, delta, note: adjustNote || undefined })
  }

  const active = rows.filter(r => r.isActive === "true")
  const lowCount = active.filter(r => isLow(r) || isOut(r)).length
  const outCount = active.filter(isOut).length
  const filtered = search ? active.filter(r => r.name.toLowerCase().includes(search.toLowerCase())) : active
  const editingItem = panel?.mode === "edit" ? panel.item : null

  return (
    <div>
      {lowCount > 0 && (
        <div style={{ background: "var(--color-red-soft)", border: "1px solid oklch(85% 0.06 25)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, color: "var(--color-red)", marginBottom: 18 }}>
          {I.alert}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{lowCount} ingredient{lowCount !== 1 ? "s" : ""} need restocking</div>
            <div style={{ fontSize: 12, color: "oklch(40% 0.12 25)", marginTop: 2 }}>{outCount > 0 ? `${outCount} out of stock · ` : ""}{lowCount - outCount} below reorder level</div>
          </div>
          <button className="btn red" style={{ flexShrink: 0, fontSize: 12 }} onClick={openLowStockPO}>Create PO from low stock</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-4)", display: "flex" }}>{I.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredients" style={iStyle({ height: 36, padding: "0 12px 0 32px" })} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => { if (api.inventory.exportMovementsCsv) api.inventory.exportMovementsCsv() }}>{I.download}&nbsp;Export</button>
        <button className="btn primary" onClick={openCreate}>{I.plus}&nbsp;Add ingredient</button>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)" }}>
                {["Name", "Unit", "Current Stock", "Reorder Level", "Cost / Unit", "Status", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 6 ? "right" : "left", padding: "10px 18px", fontWeight: 500, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-ink-3)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const out = isOut(r); const low = isLow(r)
                const stock = Number(r.currentStock); const reorder = Number(r.reorderLevel)
                const pct = reorder > 0 ? Math.min(100, Math.max(2, (stock / (reorder * 2)) * 100)) : (stock > 0 ? 100 : 2)
                const barColor = out ? "var(--color-red)" : low ? "var(--color-amber)" : "var(--color-green)"
                const isSelected = editingItem?.id === r.id
                return (
                  <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-line)" : "none", background: isSelected ? "var(--color-accent-soft)" : undefined }}>
                    <td style={{ padding: "12px 18px", fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: "12px 18px", color: "var(--color-ink-3)", fontSize: 12 }}>{r.unit}</td>
                    <td style={{ padding: "12px 18px", fontFamily: "var(--font-mono)", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ minWidth: 60 }}>{stock.toFixed(2)} <span style={{ color: "var(--color-ink-4)", fontSize: 11 }}>{r.unit}</span></span>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--color-surface-2)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 18px", color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{reorder > 0 ? `${reorder} ${r.unit}` : "—"}</td>
                    <td style={{ padding: "12px 18px", fontFamily: "var(--font-mono)" }}>₹{Number(r.costPerUnit).toFixed(2)} <span style={{ color: "var(--color-ink-4)", fontSize: 11 }}>/ {r.unit}</span></td>
                    <td style={{ padding: "12px 18px" }}>
                      {out ? <span className="badge red">Out</span> : low ? <span className="badge amber">Low</span> : <span className="badge green">In stock</span>}
                    </td>
                    <td style={{ padding: "12px 18px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn ghost sm" onClick={() => openAdjust(r)} style={{ marginRight: 6 }}>Adjust</button>
                      <button className="btn ghost sm" onClick={() => openEdit(r)}>Edit</button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)" }}>{search ? `No results for "${search}"` : "No ingredients yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {editingItem && (
          <aside style={{ width: 340, borderLeft: "1px solid var(--color-line)", background: "var(--color-surface-2)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Edit · {editingItem.name}</div>
              <button onClick={() => setPanel(null)} style={{ width: 28, height: 28, borderRadius: 7, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-ink-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.x}</button>
            </div>
            <div className="scroll" style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <FL label="Name"><input value={name} onChange={e => setName(e.target.value)} style={iStyle()} autoFocus /></FL>
              <FL label="Unit">
                <div style={{ position: "relative" }}>
                  <select value={unit} onChange={e => setUnit(e.target.value as Unit)} style={iStyle()}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-3)", pointerEvents: "none", display: "flex" }}>{I.chevD}</span>
                </div>
              </FL>
              <FL label="Reorder level">
                <div style={{ position: "relative" }}>
                  <input type="number" min="0" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} style={iStyle({ paddingRight: 36 })} />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--color-ink-3)" }}>{unit}</span>
                </div>
              </FL>
              <FL label="Cost / unit">
                <div style={{ position: "relative" }}>
                  <input type="number" min="0" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} style={iStyle({ paddingRight: 36 })} />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--color-ink-3)" }}>₹</span>
                </div>
              </FL>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 10, padding: 12, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>Stock value</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>₹{(Number(editingItem.currentStock) * Number(costPerUnit || editingItem.costPerUnit)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{Number(editingItem.currentStock).toFixed(2)} {unit} × ₹{Number(costPerUnit || editingItem.costPerUnit).toFixed(2)}/{unit}</div>
              </div>
              {isLow(editingItem) && (
                <div style={{ background: "var(--color-amber-soft)", borderRadius: 10, padding: 12, fontSize: 12, color: "oklch(45% 0.12 70)", display: "flex", gap: 8 }}>
                  {I.alert}<div>Below reorder level. Check linked recipes.</div>
                </div>
              )}
            </div>
            <div style={{ padding: 16, borderTop: "1px solid var(--color-line)", display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setPanel(null)}>Cancel</button>
              <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={doSave} disabled={!name.trim() || updateMutation.isPending}>{updateMutation.isPending ? "Saving…" : "Save changes"}</button>
            </div>
          </aside>
        )}
      </div>

      {panel?.mode === "create" && (
        <SlidePanel title="Add Ingredient" onClose={() => setPanel(null)} footer={<><button className="btn" onClick={() => setPanel(null)}>Cancel</button><button className="btn primary" onClick={doSave} disabled={!name.trim() || createMutation.isPending}>{createMutation.isPending ? "Adding…" : "Add ingredient"}</button></>}>
          <FL label="Name *"><input style={iStyle({ height: 44 })} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tomatoes" autoFocus /></FL>
          <FL label="Unit"><select value={unit} onChange={e => setUnit(e.target.value as Unit)} style={iStyle({ height: 44 })}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></FL>
          <FL label="Reorder Level"><input style={iStyle({ height: 44 })} type="number" min="0" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="0" /></FL>
          <FL label="Cost per Unit (₹)"><input style={iStyle({ height: 44 })} type="number" min="0" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} placeholder="0.00" /></FL>
        </SlidePanel>
      )}

      {panel?.mode === "adjust" && panel.item && (
        <SlidePanel title={`Adjust Stock — ${panel.item.name}`} onClose={() => setPanel(null)} footer={<><button className="btn" onClick={() => setPanel(null)}>Cancel</button><button className="btn primary" onClick={doAdjust} disabled={!adjustDelta || adjustMutation.isPending}>{adjustMutation.isPending ? "Recording…" : "Record"}</button></>}>
          <div style={{ padding: "12px 16px", background: "var(--color-surface-2)", borderRadius: 10, fontSize: 14 }}>Current stock: <strong>{Number(panel.item.currentStock).toFixed(2)} {panel.item.unit}</strong></div>
          <FL label="Movement Type"><select value={adjustType} onChange={e => setAdjustType(e.target.value as typeof adjustType)} style={iStyle({ height: 44 })}><option value="purchase">Purchase (add stock)</option><option value="waste">Waste (remove stock)</option><option value="adjustment">Adjustment</option></select></FL>
          <FL label={`Quantity (${panel.item.unit})`}><input style={iStyle({ height: 44 })} type="number" min="0" step="0.001" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} placeholder="0.000" autoFocus /></FL>
          <FL label="Note (optional)"><input style={iStyle({ height: 44 })} value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Weekly purchase" /></FL>
        </SlidePanel>
      )}

      {lowPOOpen && (
        <SlidePanel
          title="Create PO from Low Stock"
          onClose={() => setLowPOOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setLowPOOpen(false)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!lowPOVendorId || lowPOLines.length === 0 || createPOMutation.isPending}
                onClick={() => createPOMutation.mutate({
                  vendorId: lowPOVendorId,
                  notes: "Auto-created from low stock alert",
                  items: lowPOLines.map(l => ({ ingredientId: l.ingredientId, orderedQty: l.orderedQty, unitCost: l.unitCost })),
                })}
              >
                {createPOMutation.isPending ? "Creating…" : "Create Draft PO"}
              </button>
            </>
          }
        >
          <FL label="Vendor *">
            <select value={lowPOVendorId} onChange={e => setLowPOVendorId(e.target.value)} style={iStyle({ height: 44 })}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </FL>
          {vendors.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--color-amber)", background: "var(--color-amber-soft)", borderRadius: 8, padding: "10px 12px" }}>
              No vendors yet. Add a vendor in the Vendors tab first.
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>
              Items to order — adjust quantities as needed
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--color-line)" }}>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontWeight: 500 }}>INGREDIENT</span>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontWeight: 500, textAlign: "right" }}>QTY</span>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontWeight: 500, textAlign: "right" }}>₹/UNIT</span>
            </div>
            {lowPOLines.map((line, idx) => {
              const ing = rows.find(r => r.id === line.ingredientId)
              return (
                <div key={line.ingredientId} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--color-ink)" }}>{ing?.name ?? "—"} <span style={{ color: "var(--color-ink-3)", fontSize: 11 }}>({ing?.unit})</span></span>
                  <input
                    type="number" min="0.001" step="0.001"
                    value={line.orderedQty || ""}
                    onChange={e => setLowPOLines(prev => prev.map((l, i) => i === idx ? { ...l, orderedQty: Number(e.target.value) } : l))}
                    style={{ height: 34, padding: "0 8px", borderRadius: 7, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={line.unitCost || ""}
                    onChange={e => setLowPOLines(prev => prev.map((l, i) => i === idx ? { ...l, unitCost: Number(e.target.value) } : l))}
                    style={{ height: 34, padding: "0 8px", borderRadius: 7, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }}
                  />
                </div>
              )
            })}
          </div>
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchItems, setSearchItems] = useState("")
  const [addRiRecipeId, setAddRiRecipeId] = useState<string | null>(null)
  const [riIngredientId, setRiIngredientId] = useState("")
  const [riQty, setRiQty] = useState("")

  const menuItems: MenuItemRow[] = menuData?.items ?? []
  const linkedIds = new Set(recipes.map(r => r.menuItemId))
  const missingCount = menuItems.filter(m => !linkedIds.has(m.id)).length
  const filtered = searchItems ? menuItems.filter(m => m.name.toLowerCase().includes(searchItems.toLowerCase())) : menuItems

  const selectedRecipe = recipes.find(r => r.menuItemId === selectedId) ?? null
  const selectedItem = menuItems.find(m => m.id === selectedId) ?? null
  const hasRecipe = selectedId ? linkedIds.has(selectedId) : false

  const createMutation = useMutation({ mutationFn: (b: unknown) => api.inventory.createRecipe(b), onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }) })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.inventory.deleteRecipe(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }) })
  const addRiMutation = useMutation({ mutationFn: ({ recipeId, body }: { recipeId: string; body: unknown }) => api.inventory.addRecipeIngredient(recipeId, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); setAddRiRecipeId(null); setRiIngredientId(""); setRiQty("") } })
  const deleteRiMutation = useMutation({ mutationFn: ({ recipeId, riId }: { recipeId: string; riId: string }) => api.inventory.deleteRecipeIngredient(recipeId, riId), onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }) })

  const totalCost = (selectedRecipe?.recipeIngredients ?? []).reduce((s, ri) => s + Number(ri.quantity) * Number(ri.ingredient?.costPerUnit ?? 0), 0)

  return (
    <div style={{ display: "flex", minHeight: 560, border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
      <aside style={{ width: 272, flexShrink: 0, borderRight: "1px solid var(--color-line)", background: "var(--color-surface)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--color-line)" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-4)", display: "flex" }}>{I.search}</span>
            <input value={searchItems} onChange={e => setSearchItems(e.target.value)} placeholder="Search menu items" style={iStyle({ padding: "0 12px 0 30px", background: "var(--color-surface-2)" })} />
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--color-ink-3)", marginTop: 10 }}>
            <span>{menuItems.length} items</span>
            {missingCount > 0 && <><span>·</span><span style={{ color: "var(--color-amber)" }}>{missingCount} missing recipes</span></>}
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: "6px 8px" }}>
          {filtered.map(m => (
            <button key={m.id} onClick={() => setSelectedId(m.id)} style={{ width: "100%", textAlign: "left", appearance: "none", background: selectedId === m.id ? "var(--color-accent-soft)" : "transparent", border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 500, color: selectedId === m.id ? "var(--color-ink)" : "var(--color-ink-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              {!linkedIds.has(m.id) && <span style={{ fontSize: 10, color: "var(--color-amber)", fontWeight: 600, flexShrink: 0 }}>No recipe</span>}
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: "20px 10px", fontSize: 12, color: "var(--color-ink-3)", textAlign: "center" }}>No items found</div>}
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--color-ink-3)" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink-2)" }}>Select a menu item</div>
            <div style={{ fontSize: 12 }}>{recipes.length} recipe{recipes.length !== 1 ? "s" : ""} defined · {missingCount} missing</div>
          </div>
        ) : !hasRecipe ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--color-ink-3)", padding: 32 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink-2)", marginBottom: 6 }}>{selectedItem?.name}</div>
              <div style={{ fontSize: 13 }}>No recipe yet. Add one to enable auto-deduction when sold.</div>
            </div>
            <button className="btn primary" onClick={() => createMutation.mutate({ menuItemId: selectedId })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : <>{I.plus}&nbsp;Create recipe</>}
            </button>
          </div>
        ) : selectedRecipe ? (
          <>
            <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid var(--color-line)", background: "var(--color-surface)" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>{selectedRecipe.menuItem?.name ?? selectedItem?.name}</h1>
                  <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 13, color: "var(--color-ink-3)" }}>
                    <span>Ingredient cost <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink)", fontWeight: 500 }}>₹{totalCost.toFixed(2)}</span></span>
                    <span>·</span>
                    <span>{selectedRecipe.recipeIngredients.length} ingredient{selectedRecipe.recipeIngredients.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <button className="btn red sm" onClick={() => { if (confirm("Delete this recipe?")) deleteMutation.mutate(selectedRecipe.id) }}>Delete recipe</button>
              </div>
            </div>

            <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "22px 28px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-line)", display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Ingredients per serving</div>
                  <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{selectedRecipe.recipeIngredients.length} items</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      {["Ingredient", "Quantity", "Unit", "Cost", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: i === 1 || i === 3 ? "right" : "left", padding: "8px 18px", fontWeight: 500, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-ink-3)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRecipe.recipeIngredients.map(ri => (
                      <tr key={ri.id} style={{ borderTop: "1px solid var(--color-line)" }}>
                        <td style={{ padding: "10px 18px", fontWeight: 500 }}>{ri.ingredient?.name ?? "?"}</td>
                        <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{Number(ri.quantity).toFixed(3)}</td>
                        <td style={{ padding: "10px 18px", color: "var(--color-ink-3)", fontSize: 12 }}>{ri.ingredient?.unit}</td>
                        <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "var(--font-mono)" }}>₹{(Number(ri.quantity) * Number(ri.ingredient?.costPerUnit ?? 0)).toFixed(2)}</td>
                        <td style={{ padding: "10px 18px", textAlign: "right", width: 40 }}>
                          <button onClick={() => { if (confirm("Remove?")) deleteRiMutation.mutate({ recipeId: selectedRecipe.id, riId: ri.id }) }} style={{ background: "transparent", border: "none", color: "var(--color-ink-4)", cursor: "pointer", padding: 4, display: "flex" }}>{I.trash}</button>
                        </td>
                      </tr>
                    ))}
                    {addRiRecipeId === selectedRecipe.id ? (
                      <tr style={{ borderTop: "1px solid var(--color-line)" }}>
                        <td colSpan={5} style={{ padding: "10px 18px" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <select value={riIngredientId} onChange={e => setRiIngredientId(e.target.value)} style={{ flex: 1, height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit", outline: "none" }}><option value="">Ingredient…</option>{ingredients.filter(i => i.isActive === "true").map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select>
                            <input type="number" min="0.001" step="0.001" value={riQty} onChange={e => setRiQty(e.target.value)} placeholder="Qty" style={{ width: 70, height: 34, padding: "0 8px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }} />
                            <button className="btn sm" onClick={() => setAddRiRecipeId(null)}>Cancel</button>
                            <button className="btn primary sm" onClick={() => riIngredientId && riQty && addRiMutation.mutate({ recipeId: selectedRecipe.id, body: { ingredientId: riIngredientId, quantity: Number(riQty) } })} disabled={!riIngredientId || !riQty}>Add</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr style={{ borderTop: "1px solid var(--color-line)" }}>
                        <td colSpan={5} style={{ padding: "10px 18px" }}>
                          <button onClick={() => { setRiIngredientId(""); setRiQty(""); setAddRiRecipeId(selectedRecipe.id) }} style={{ appearance: "none", background: "transparent", border: "none", color: "var(--color-ink-3)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>{I.plus} Add ingredient</button>
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-line)" }}>
                      <td colSpan={3} style={{ padding: "10px 18px", fontWeight: 600 }}>Total ingredient cost</td>
                      <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>₹{totalCost.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Cost breakdown</div>
                  <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--color-ink-3)" }}>Ingredient cost</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>₹{totalCost.toFixed(2)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--color-ink-3)" }}>Basis</span><span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>per serving</span></div>
                  </div>
                </div>
                <div style={{ background: "var(--color-accent-soft)", border: "1px solid oklch(86% 0.05 70)", borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-accent-ink)", flexShrink: 0 }}>{I.sparkle}</span>
                  <div style={{ fontSize: 12, color: "var(--color-accent-ink)" }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Auto-deduct enabled</div>
                    Selling this dish deducts these quantities from stock.
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ── Stock Movements Tab ────────────────────────────────────────────────────────
const MV_BADGE: Record<MovementType, string> = { purchase: "badge green", sale: "badge blue", waste: "badge red", adjustment: "badge" }
const MV_LABEL: Record<MovementType, string> = { purchase: "Purchase", sale: "Sale", waste: "Waste", adjustment: "Adjustment" }

function MovementsTab() {
  const today = new Date().toISOString().split("T")[0]!
  const [typeFilter, setTypeFilter] = useState<MovementType | "all">("all")
  const [exportFrom, setExportFrom] = useState(today)
  const [exportTo, setExportTo] = useState(today)
  const [ingSearch, setIngSearch] = useState("")
  const { data: rows = [] } = useQuery<Movement[]>({ queryKey: ["movements"], queryFn: () => api.inventory.listMovements(100) as Promise<Movement[]> })

  const filtered = rows.filter(r => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false
    if (ingSearch && !r.ingredient?.name.toLowerCase().includes(ingSearch.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", borderRadius: 9, fontSize: 13, color: "var(--color-ink-3)" }}>
          {I.cal}
          <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)" }} />
          <span>–</span>
          <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)" }} />
        </div>
        <div style={{ display: "flex", gap: 3, padding: 3, background: "var(--color-surface-2)", borderRadius: 9 }}>
          {(["all", "purchase", "sale", "waste", "adjustment"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ appearance: "none", border: "none", cursor: "pointer", padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: typeFilter === t ? "var(--color-surface)" : "transparent", color: typeFilter === t ? "var(--color-ink)" : "var(--color-ink-3)", boxShadow: typeFilter === t ? "0 1px 2px rgba(0,0,0,.06)" : "none", fontFamily: "inherit" }}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", maxWidth: 200 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-4)", display: "flex" }}>{I.search}</span>
          <input value={ingSearch} onChange={e => setIngSearch(e.target.value)} placeholder="Ingredient" style={iStyle({ height: 34, padding: "0 12px 0 30px" })} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => api.inventory.exportMovementsCsv(exportFrom, exportTo)}>{I.download}&nbsp;Export CSV</button>
        <button className="btn primary">{I.plus}&nbsp;Manual entry</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--color-line)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--color-line)" }}>
        {[
          { k: "Total purchases", v: rows.filter(r => r.type === "purchase").length, d: "incoming stock" },
          { k: "Sales (auto)", v: rows.filter(r => r.type === "sale").length, d: "auto-deducted" },
          { k: "Waste entries", v: rows.filter(r => r.type === "waste").length, d: "recorded losses", red: true },
          { k: "Adjustments", v: rows.filter(r => r.type === "adjustment").length, d: "manual corrections" },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-surface)", padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 500 }}>{s.k}</div>
            <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 4 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: s.red && s.v > 0 ? "var(--color-red)" : "var(--color-ink-3)", marginTop: 2 }}>{s.d}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0 }}>
            <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)", color: "var(--color-ink-3)" }}>
              {["Date / Time", "Ingredient", "Type", "Quantity", "Note", "Recorded by"].map((h, i) => (
                <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "10px 18px", fontWeight: 500, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => {
              const delta = Number(m.delta)
              return (
                <tr key={m.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                  <td style={{ padding: "11px 18px", color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "11px 18px", fontWeight: 500 }}>{m.ingredient?.name ?? "—"}</td>
                  <td style={{ padding: "11px 18px" }}><span className={MV_BADGE[m.type]}>{MV_LABEL[m.type]}</span></td>
                  <td style={{ padding: "11px 18px", textAlign: "right", fontFamily: "var(--font-mono)", color: delta >= 0 ? "var(--color-green)" : "var(--color-red)", fontWeight: 500 }}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(3)} <span style={{ color: "var(--color-ink-4)", fontSize: 11 }}>{m.ingredient?.unit ?? ""}</span>
                  </td>
                  <td style={{ padding: "11px 18px", color: "var(--color-ink-3)", fontSize: 12 }}>{m.note ?? "—"}</td>
                  <td style={{ padding: "11px 18px", color: "var(--color-ink-2)", fontSize: 12 }}>{m.recordedBy?.name ?? "system"}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)" }}>No movements found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Vendors Tab ───────────────────────────────────────────────────────────────
const AV_COLORS = ["#f87171","#fb923c","#facc15","#4ade80","#34d399","#38bdf8","#818cf8","#e879f9"]
function avColor(name: string) { return AV_COLORS[(name.charCodeAt(0) ?? 0) % 8]! }
function av(name: string) { return name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() }

function VendorsTab() {
  const qc = useQueryClient()
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => api.vendors.list() as Promise<Vendor[]> })
  const [panel, setPanel] = useState<{ mode: "create" | "edit"; item?: Vendor } | null>(null)
  const [search, setSearch] = useState("")
  const [vName, setVName] = useState(""); const [vPhone, setVPhone] = useState(""); const [vEmail, setVEmail] = useState(""); const [vGstin, setVGstin] = useState(""); const [vAddress, setVAddress] = useState("")

  function openCreate() { setVName(""); setVPhone(""); setVEmail(""); setVGstin(""); setVAddress(""); setPanel({ mode: "create" }) }
  function openEdit(v: Vendor) { setVName(v.name); setVPhone(v.phone ?? ""); setVEmail(v.email ?? ""); setVGstin(v.gstin ?? ""); setVAddress(v.address ?? ""); setPanel({ mode: "edit", item: v }) }

  const createMutation = useMutation({ mutationFn: (b: unknown) => api.vendors.create(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setPanel(null) } })
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: unknown }) => api.vendors.update(id, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setPanel(null) } })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.vendors.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setPanel(null) } })

  function doSave() {
    if (!vName.trim()) return
    const body = { name: vName.trim(), phone: vPhone || undefined, email: vEmail || undefined, gstin: vGstin || undefined, address: vAddress || undefined }
    if (panel?.mode === "create") createMutation.mutate(body)
    else if (panel?.mode === "edit" && panel.item) updateMutation.mutate({ id: panel.item.id, body })
  }

  const fv = search ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase())) : vendors

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-4)", display: "flex" }}>{I.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors" style={iStyle({ height: 36, padding: "0 12px 0 32px" })} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={openCreate}>{I.plus}&nbsp;Add vendor</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {fv.map(v => (
          <article key={v.id} onClick={() => openEdit(v)} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18, opacity: v.isActive ? 1 : 0.65, display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", transition: "box-shadow .15s" }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = "var(--shadow-2)")}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: avColor(v.name), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{av(v.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                  {!v.isActive && <div style={{ fontSize: 10, color: "var(--color-ink-4)" }}>Inactive</div>}
                </div>
              </div>
              <span onClick={e => { e.stopPropagation(); openEdit(v) }} style={{ color: "var(--color-ink-4)", padding: 4, cursor: "pointer" }}>{I.more}</span>
            </header>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--color-ink-2)" }}>
              {v.phone && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--color-ink-4)", display: "flex" }}>{I.phone}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{v.phone}</span></div>}
              {v.email && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--color-ink-4)", display: "flex" }}>{I.mail}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.email}</span></div>}
              {v.gstin && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--color-ink-4)", display: "flex" }}>{I.file}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{v.gstin}</span></div>}
            </div>
            <footer style={{ borderTop: "1px solid var(--color-line)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--color-ink-3)" }}>{v.lastPOAt ? <>Last PO <span style={{ color: "var(--color-ink-2)", fontWeight: 500 }}>{new Date(v.lastPOAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span></> : "No POs yet"}</span>
              {v.openPOCount > 0 && <span className="badge amber" style={{ fontSize: 10 }}>{v.openPOCount} open</span>}
            </footer>
          </article>
        ))}
        <article onClick={openCreate} style={{ border: "1.5px dashed var(--color-line-strong)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)", minHeight: 185, gap: 10, padding: 18, cursor: "pointer" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>{I.plus}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)" }}>Add new vendor</div>
          <div style={{ fontSize: 11, textAlign: "center" }}>Track suppliers, link to ingredients & POs</div>
        </article>
      </div>

      {panel && (
        <SlidePanel title={panel.mode === "create" ? "Add Vendor" : "Edit Vendor"} onClose={() => setPanel(null)} footer={
          <>{panel.mode === "edit" && panel.item && <button className="btn red" onClick={() => { if (confirm(`Delete "${panel.item!.name}"?`)) deleteMutation.mutate(panel.item!.id) }} disabled={panel.item.openPOCount > 0 || deleteMutation.isPending}>Delete</button>}
          <button className="btn" onClick={() => setPanel(null)}>Cancel</button>
          <button className="btn primary" onClick={doSave} disabled={!vName.trim() || createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save"}</button></>
        }>
          <FL label="Name *"><input style={iStyle({ height: 44 })} value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Fresh Farms Ltd" autoFocus /></FL>
          <FL label="Phone"><input style={iStyle({ height: 44 })} value={vPhone} onChange={e => setVPhone(e.target.value)} placeholder="+91 98765 43210" /></FL>
          <FL label="Email"><input style={iStyle({ height: 44 })} type="email" value={vEmail} onChange={e => setVEmail(e.target.value)} placeholder="supplier@example.com" /></FL>
          <FL label="GSTIN"><input style={iStyle({ height: 44 })} value={vGstin} onChange={e => setVGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" /></FL>
          <FL label="Address"><textarea value={vAddress} onChange={e => setVAddress(e.target.value)} placeholder="Street, City, State" rows={3} style={{ ...iStyle({ height: "auto", padding: "10px 14px" }), resize: "vertical" }} /></FL>
          {panel.mode === "edit" && panel.item?.openPOCount && panel.item.openPOCount > 0 ? <p style={{ fontSize: 12, color: "oklch(45% 0.12 70)", margin: 0 }}>Cannot delete: has {panel.item.openPOCount} open PO(s).</p> : null}
        </SlidePanel>
      )}
    </div>
  )
}

// ── Purchase Orders Tab ───────────────────────────────────────────────────────
const PO_S: Record<POStatus, { label: string; cls: string; dot: string }> = {
  draft:    { label: "Draft",    cls: "",      dot: "gray" },
  ordered:  { label: "Ordered",  cls: "blue",  dot: "green" },
  partial:  { label: "Partial",  cls: "amber", dot: "amber" },
  received: { label: "Received", cls: "green", dot: "green" },
}

function PurchaseOrdersTab() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: allPOs = [] } = useQuery<POListItem[]>({ queryKey: ["purchase-orders"], queryFn: () => api.purchaseOrders.list() as Promise<POListItem[]> })
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => api.vendors.list() as Promise<Vendor[]> })
  const { data: ingredients = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState<POStatus | "all">("all"); const [panel, setPanel] = useState(false)
  const [newVendorId, setNewVendorId] = useState(""); const [newExpectedAt, setNewExpectedAt] = useState(""); const [newNotes, setNewNotes] = useState("")
  const [lines, setLines] = useState<POLineInput[]>([{ ingredientId: "", orderedQty: 0, unitCost: 0 }])

  const markOrderedMutation = useMutation({ mutationFn: (id: string) => api.purchaseOrders.markOrdered(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }) })
  const createMutation = useMutation({ mutationFn: (b: unknown) => api.purchaseOrders.create(b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); setPanel(false); resetNewPO() } })

  function resetNewPO() { setNewVendorId(""); setNewExpectedAt(""); setNewNotes(""); setLines([{ ingredientId: "", orderedQty: 0, unitCost: 0 }]) }
  function openPanel() { resetNewPO(); setNewVendorId(vendors[0]?.id ?? ""); setPanel(true) }
  function updateLine(idx: number, patch: Partial<POLineInput>) { setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l)) }
  function removeLine(idx: number) { setLines(prev => prev.filter((_, i) => i !== idx)) }
  function doCreate() {
    const vl = lines.filter(l => l.ingredientId && l.orderedQty > 0 && l.unitCost >= 0)
    if (!newVendorId || vl.length === 0) return
    createMutation.mutate({ vendorId: newVendorId, notes: newNotes || undefined, expectedAt: newExpectedAt || undefined, items: vl.map(l => ({ ingredientId: l.ingredientId, orderedQty: l.orderedQty, unitCost: l.unitCost })) })
  }

  const now = new Date(); const msStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const openPOs = allPOs.filter(p => p.status !== "received")
  const openValue = openPOs.reduce((s, p) => s + Number(p.totalAmount), 0)
  const recvMTD = allPOs.filter(p => p.status === "received" && p.receivedAt && new Date(p.receivedAt) >= msStart)
  const awaitingToday = allPOs.filter(p => p.status === "ordered" && p.expectedAt && new Date(p.expectedAt).toDateString() === now.toDateString())

  const filtered = allPOs.filter(p => {
    if (search && !p.vendor?.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== "all" && p.status !== statusFilter) return false
    return true
  })

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { k: "Open POs", v: openPOs.length, d: `₹${openValue.toLocaleString("en-IN")} outstanding` },
          { k: "Received MTD", v: recvMTD.length, d: "this month" },
          { k: "Awaiting today", v: awaitingToday.length, d: awaitingToday[0]?.vendor?.name ?? "None expected" },
          { k: "Drafts", v: allPOs.filter(p => p.status === "draft").length, d: "pending submission" },
        ].map((s, i) => (
          <div key={i} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 500 }}>{s.k}</div>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 4 }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>{s.d}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--color-ink-4)", display: "flex" }}>{I.search}</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO or vendor" style={iStyle({ height: 36, padding: "0 12px 0 32px" })} />
        </div>
        <div style={{ display: "flex", gap: 3, padding: 3, background: "var(--color-surface-2)", borderRadius: 9 }}>
          {(["all", "draft", "ordered", "partial", "received"] as const).map(t => (
            <button key={t} onClick={() => setStatusFilter(t)} style={{ appearance: "none", border: "none", cursor: "pointer", padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: statusFilter === t ? "var(--color-surface)" : "transparent", color: statusFilter === t ? "var(--color-ink)" : "var(--color-ink-3)", boxShadow: statusFilter === t ? "0 1px 2px rgba(0,0,0,.06)" : "none", fontFamily: "inherit" }}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={openPanel}>{I.plus}&nbsp;Create PO</button>
      </div>

      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-line)", color: "var(--color-ink-3)" }}>
              {["#", "Vendor", "Items", "Total", "Status", "Created", "Expected", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i === 2 || i === 3 ? "right" : "left", padding: "10px 18px", fontWeight: 500, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((po, i) => {
              const s = PO_S[po.status]
              return (
                <tr key={po.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                  <td style={{ padding: "12px 18px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-3)" }}>{i + 1}</td>
                  <td style={{ padding: "12px 18px", fontWeight: 500 }}>{po.vendor?.name ?? "—"}{po.vendor?.phone && <div style={{ fontSize: 11, color: "var(--color-ink-3)", fontWeight: 400 }}>{po.vendor.phone}</div>}</td>
                  <td style={{ padding: "12px 18px", textAlign: "right", color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{po.itemCount}</td>
                  <td style={{ padding: "12px 18px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }}>{Number(po.totalAmount) > 0 ? `₹${Number(po.totalAmount).toLocaleString("en-IN")}` : <span style={{ color: "var(--color-ink-4)" }}>—</span>}</td>
                  <td style={{ padding: "12px 18px" }}><span className={`badge ${s.cls}`}><span className={`dot ${s.dot}`} /> {s.label}</span></td>
                  <td style={{ padding: "12px 18px", color: "var(--color-ink-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{new Date(po.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td style={{ padding: "12px 18px", color: "var(--color-ink-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{po.expectedAt ? new Date(po.expectedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td>
                  <td style={{ padding: "12px 18px", textAlign: "right" }}>
                    {po.status === "draft" ? <button className="btn sm" onClick={() => markOrderedMutation.mutate(po.id)} disabled={markOrderedMutation.isPending}>Mark Ordered</button>
                    : po.status === "ordered" || po.status === "partial" ? <button className="btn sm" onClick={() => navigate({ to: `/inventory/purchase-orders/${po.id}` })}>Open {I.chevR}</button>
                    : <button className="btn ghost sm" onClick={() => navigate({ to: `/inventory/purchase-orders/${po.id}` })}>View</button>}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)" }}>No purchase orders found.</td></tr>}
          </tbody>
        </table>
      </div>

      {panel && (
        <SlidePanel title="New Purchase Order" onClose={() => setPanel(false)} footer={
          <><button className="btn" onClick={() => setPanel(false)}>Cancel</button><button className="btn primary" onClick={doCreate} disabled={!newVendorId || !lines.some(l => l.ingredientId && l.orderedQty > 0) || createMutation.isPending}>{createMutation.isPending ? "Creating…" : "Create PO"}</button></>
        }>
          <FL label="Vendor *"><select value={newVendorId} onChange={e => setNewVendorId(e.target.value)} style={iStyle({ height: 44 })}><option value="">Select vendor…</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></FL>
          <FL label="Expected Date"><input style={iStyle({ height: 44 })} type="date" value={newExpectedAt} onChange={e => setNewExpectedAt(e.target.value)} /></FL>
          <FL label="Notes"><textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any notes…" rows={2} style={{ ...iStyle({ height: "auto", padding: "10px 14px" }), resize: "vertical" }} /></FL>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 10 }}>Line Items *</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lines.map((line, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 28px", gap: 8 }}>
                  <select value={line.ingredientId} onChange={e => updateLine(idx, { ingredientId: e.target.value })} style={{ height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "inherit", outline: "none" }}><option value="">Ingredient…</option>{ingredients.filter(i => i.isActive === "true").map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select>
                  <input type="number" min="0.001" step="0.001" value={line.orderedQty || ""} onChange={e => updateLine(idx, { orderedQty: Number(e.target.value) })} placeholder="Qty" style={{ height: 36, padding: "0 8px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }} />
                  <input type="number" min="0" step="0.01" value={line.unitCost || ""} onChange={e => updateLine(idx, { unitCost: Number(e.target.value) })} placeholder="₹/u" style={{ height: 36, padding: "0 8px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-bg)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }} />
                  <button onClick={() => removeLine(idx)} disabled={lines.length === 1} style={{ height: 36, borderRadius: 7, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink-3)", fontSize: 16, cursor: lines.length === 1 ? "not-allowed" : "pointer", opacity: lines.length === 1 ? .4 : 1 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines(p => [...p, { ingredientId: "", orderedQty: 0, unitCost: 0 }])} style={{ marginTop: 10, fontSize: 13, color: "var(--color-ink-2)", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>{I.plus} Add line item</button>
          </div>
        </SlidePanel>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = "ingredients" | "recipes" | "movements" | "vendors" | "purchase-orders"

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("ingredients")
  const { data: ingredients = [] } = useQuery<Ingredient[]>({ queryKey: ["ingredients"], queryFn: () => api.inventory.listIngredients() as Promise<Ingredient[]> })
  const lowCount = ingredients.filter(i => i.isActive === "true" && (isLow(i) || isOut(i))).length

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "ingredients",     label: "Ingredients",     badge: lowCount || undefined },
    { id: "recipes",         label: "Recipes" },
    { id: "movements",       label: "Stock Movements" },
    { id: "vendors",         label: "Vendors" },
    { id: "purchase-orders", label: "Purchase Orders" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--color-bg)" }}>
      <TopBar current="inventory" />
      <div style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", padding: "0 32px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ appearance: "none", background: "transparent", border: "none", cursor: "pointer", padding: "13px 16px 11px", fontSize: 13, fontWeight: 500, color: t.id === tab ? "var(--color-ink)" : "var(--color-ink-3)", borderBottom: `2px solid ${t.id === tab ? "var(--color-ink)" : "transparent"}`, marginBottom: -1, display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit" }}>
              {t.label}
              {t.badge != null && t.badge > 0 && <span style={{ background: "var(--color-red)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {tab === "ingredients"     && <IngredientsTab />}
          {tab === "recipes"         && <RecipesTab />}
          {tab === "movements"       && <MovementsTab />}
          {tab === "vendors"         && <VendorsTab />}
          {tab === "purchase-orders" && <PurchaseOrdersTab />}
        </div>
      </div>
    </div>
  )
}
