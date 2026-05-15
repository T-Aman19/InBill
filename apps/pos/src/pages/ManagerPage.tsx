import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { api } from "@/lib/api"
import { TopBar } from "@/components/ui/TopBar"
import { formatCurrency } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────
type Staff = { id: string; name: string; role: string; isActive: boolean }
type EditRecord = { _new?: boolean; id?: string; name: string; role: string; pin: string; isActive: boolean }

type Category = { id: string; name: string; sortOrder: number; isActive: boolean }
type MenuItemRow = { id: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; isAvailable: boolean; description?: string; hsnCode?: string; taxConfigId?: string | null }
type ItemVariant = { id: string; itemId: string; name: string; price: string; isActive: boolean }
type ModifierGroup = { id: string; name: string; required: boolean; multiSelect: boolean; minSelect: number; maxSelect?: number | null }
type Modifier = { id: string; groupId: string; name: string; price: string; isActive: boolean }
type ItemModifierGroupLink = { itemId: string; groupId: string }
type EditItem = { _new?: boolean; id?: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; description: string; hsnCode?: string; taxConfigId?: string | null }

type DiscountRow = { id: string; name: string; type: "percentage" | "flat"; value: string; minOrderValue: string; maxDiscountAmount?: string | null; code?: string | null; validFrom?: string | null; validTo?: string | null; usageLimit?: number | null; usageCount: number; isActive: boolean }

type Floor = { id: string; name: string; sortOrder: number }
type TableRow = { id: string; floorId: string; name: string; capacity: number; status: string }
type EditTable = { _new?: boolean; id?: string; floorId: string; name: string; capacity: number }

type TaxConfig = { id?: string; name: string; cgstRate: string; sgstRate: string; igstRate: string }

type ReportSummary = { billCount: number; totalRevenue: number; totalTax: number; totalDiscount: number; byPaymentMode: Record<string, number> }
type OutletInfo = { id: string; name: string; address: string; phone: string; gstin?: string; timezone: string; currency: string; upiVpa?: string; razorpayKeyId?: string }

// ── Constants ────────────────────────────────────────────────────────────────
const ROLES = ["manager", "cashier", "captain", "kitchen"] as const
const ROLE_COLOR: Record<string, string> = { manager: "red", cashier: "blue", captain: "amber", kitchen: "green" }
const ROLE_DESCRIPTION: Record<string, string> = { manager: "All access", cashier: "POS & billing", captain: "Take orders", kitchen: "KDS only" }
type NavId = "staff" | "menu" | "tables" | "taxes" | "modifiers" | "discounts" | "shifts" | "customers" | "expenses" | "outlet" | "devices"

// ── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase()
}
function RoleBadge({ role }: { role: string }) {
  return <span className={`badge ${ROLE_COLOR[role.toLowerCase()] ?? ""}`} style={{ textTransform: "capitalize" }}>{role}</span>
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
  return { width: "100%", height: 44, padding: "0 14px", border: "1px solid var(--color-line-strong)", borderRadius: 10, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, outline: "none", fontFamily: "inherit", ...extra }
}
function SlidePanel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} className="animate-overlay-in" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.18)" }} />
      <div className="animate-slide-right" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 440, background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", boxShadow: "-12px 0 40px rgba(0,0,0,.12)", display: "flex", flexDirection: "column" }}>
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
function CancelBtn({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
      Cancel
    </button>
  )
}
function SaveBtn({ disabled, label = "Save", onClick }: { disabled?: boolean; label?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1 }}>
      {label}
    </button>
  )
}
function ActionBtn({ onClick, title, danger }: { onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = danger ? "var(--color-red-soft)" : "var(--color-surface-2)"; (e.currentTarget as HTMLButtonElement).style.color = danger ? "var(--color-red)" : "var(--color-ink)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
      {title === "Edit"
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      }
    </button>
  )
}

// ── Staff tab ────────────────────────────────────────────────────────────────
function StaffEditPanel({ record, onClose, onSaved }: { record: EditRecord; onClose: () => void; onSaved: () => void }) {
  const isNew = !!record._new
  const qc = useQueryClient()
  const [name, setName] = useState(record.name)
  const [role, setRole] = useState(record.role || "captain")
  const [pin, setPin] = useState(isNew ? "" : "••••")
  const [error, setError] = useState<string | null>(null)

  const pinChanged = pin !== "••••" && pin !== ""
  const canSave = name.trim() &&
    (isNew ? pin.length === 4 : (!pinChanged || pin.length === 4))

  const createMutation = useMutation({
    mutationFn: () => api.users.create({ name: name.trim(), role, pin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onSaved(); onClose() },
    onError: (e: Error) => setError(e.message),
  })
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!record.id) throw new Error("Missing staff ID — please close and reopen the panel")
      const updates: Record<string, unknown> = { name: name.trim(), role }
      if (pinChanged) updates["pin"] = pin
      return api.users.update(record.id, updates)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); onSaved(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const doSave = () => { if (!canSave || isPending) return; setError(null); isNew ? createMutation.mutate() : updateMutation.mutate() }

  return (
    <SlidePanel title={isNew ? "Add staff member" : `Edit ${record.name}`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={doSave} disabled={!canSave || isPending} label={isPending ? (isNew ? "Adding…" : "Saving…") : isNew ? "Add staff" : "Save changes"} /></>}>
      {field("Full name",
        <input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="e.g. Ravi Kumar" style={inputStyle()}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
      )}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Role</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ROLES.map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ padding: "12px 14px", textAlign: "left", border: "1.5px solid " + (role === r ? "var(--color-ink)" : "var(--color-line)"), background: role === r ? "var(--color-surface-2)" : "var(--color-surface)", borderRadius: 10, cursor: "pointer", fontSize: 13, display: "flex", flexDirection: "column", gap: 4, fontFamily: "inherit", transition: "all .1s" }}>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{r}</span>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{ROLE_DESCRIPTION[r]}</span>
            </button>
          ))}
        </div>
      </div>
      {field(isNew ? "4-digit PIN" : "Reset PIN",
        <input type="text" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "")); setError(null) }} placeholder="••••"
          style={inputStyle({ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".4em", textAlign: "center" })}
          onFocus={(e) => { if (e.currentTarget.value === "••••") setPin(""); e.currentTarget.style.borderColor = "var(--color-ink-3)"; }}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />

)}
      {!isNew && <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Leave PIN empty to keep current</span>}
      {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--color-red-soft)", color: "var(--color-red)", fontSize: 13 }}>{error}</div>}
    </SlidePanel>
  )
}

function StaffTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<EditRecord | null>(null)
  const { data: staff = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.users.getAll() as Promise<Staff[]> })
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] })
  const disableMutation = useMutation({ mutationFn: (id: string) => api.users.disable(id), onSuccess: invalidate })
  const enableMutation = useMutation({ mutationFn: (id: string) => api.users.update(id, { isActive: true }), onSuccess: invalidate })

  return (
    <>
      <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--color-line)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Staff & PINs</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Anyone with a PIN can sign in. Disable to revoke access without deleting history.</div>
        </div>
        <button onClick={() => setEditing({ _new: true, name: "", role: "captain", pin: "", isActive: true })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add staff
        </button>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 120px 100px", padding: "12px 28px", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid var(--color-line)" }}>
          <span>Name</span><span>Role</span><span>PIN</span><span>Status</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {staff.map((s) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 120px 100px", padding: "14px 28px", alignItems: "center", borderBottom: "1px solid var(--color-line)", opacity: s.isActive ? 1 : .5 }}
            onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)"}
            onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{initials(s.name)}</div>
              <div><div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div><div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 1 }}>{s.isActive ? "Active" : "Disabled"}</div></div>
            </div>
            <span><RoleBadge role={s.role} /></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>••••</span>
            <span>{s.isActive ? <span className="badge green"><span className="dot green" /> Active</span> : <span className="badge"><span className="dot gray" /> Disabled</span>}</span>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
              <ActionBtn onClick={() => setEditing({ id: s.id, name: s.name, role: s.role, pin: "••••", isActive: s.isActive })} title="Edit" />
              <button onClick={() => s.isActive ? disableMutation.mutate(s.id) : enableMutation.mutate(s.id)} title={s.isActive ? "Disable" : "Enable"} style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = s.isActive ? "var(--color-red-soft)" : "var(--color-green-soft)"; (e.currentTarget as HTMLButtonElement).style.color = s.isActive ? "var(--color-red)" : "var(--color-green)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
                {s.isActive
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>}
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && <StaffEditPanel record={editing} onClose={() => setEditing(null)} onSaved={() => {}} />}
    </>
  )
}

// ── Menu tab ─────────────────────────────────────────────────────────────────
function ItemEditPanel({ item, categories, taxConfigs, variants, allModifierGroups, itemModifierGroupLinks, onClose, onSaved }: {
  item: EditItem; categories: Category[]; taxConfigs: TaxConfig[]
  variants: ItemVariant[]; allModifierGroups: ModifierGroup[]; itemModifierGroupLinks: ItemModifierGroupLink[]
  onClose: () => void; onSaved: () => void
}) {
  const isNew = !!item._new
  const qc = useQueryClient()
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(item.basePrice)
  const [catId, setCatId] = useState(item.categoryId)
  const [isVeg, setIsVeg] = useState(item.isVeg)
  const [desc, setDesc] = useState(item.description)
  const [hsnCode, setHsnCode] = useState(item.hsnCode ?? "")
  const [taxConfigId, setTaxConfigId] = useState(item.taxConfigId ?? "")
  const [newVarName, setNewVarName] = useState("")
  const [newVarPrice, setNewVarPrice] = useState("")

  const linkedGroupIds = new Set(itemModifierGroupLinks.filter((l) => l.itemId === item.id).map((l) => l.groupId))

  const canSave = name.trim() && parseFloat(price) >= 0 && catId

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["menu"] }); onSaved() }

  const itemPayload = () => ({ name, basePrice: parseFloat(price), categoryId: catId, isVeg, description: desc || undefined, hsnCode: hsnCode.trim() || undefined, taxConfigId: taxConfigId || null })
  const createMutation = useMutation({ mutationFn: () => api.menu.createItem(itemPayload()), onSuccess: () => { invalidate(); onClose() } })
  const updateMutation = useMutation({ mutationFn: () => api.menu.updateItem(item.id!, itemPayload()), onSuccess: () => { invalidate(); onClose() } })
  const addVariantMutation = useMutation({
    mutationFn: () => api.menu.createVariant(item.id!, { name: newVarName.trim(), price: parseFloat(newVarPrice) }),
    onSuccess: () => { invalidate(); setNewVarName(""); setNewVarPrice("") },
  })
  const deleteVariantMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteVariant(id), onSuccess: invalidate })
  const linkGroupMutation = useMutation({ mutationFn: (groupId: string) => api.menu.linkModifierGroup(item.id!, groupId), onSuccess: invalidate })
  const unlinkGroupMutation = useMutation({ mutationFn: (groupId: string) => api.menu.unlinkModifierGroup(item.id!, groupId), onSuccess: invalidate })

  const isPending = createMutation.isPending || updateMutation.isPending
  const doSave = () => { if (!canSave || isPending) return; isNew ? createMutation.mutate() : updateMutation.mutate() }

  return (
    <SlidePanel title={isNew ? "Add item" : `Edit "${item.name}"`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={doSave} disabled={!canSave || isPending} label={isPending ? "Saving…" : isNew ? "Add item" : "Save"} /></>}>
      <form onSubmit={(e) => { e.preventDefault(); doSave() }} style={{ display: "contents" }}>
        {field("Item name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Butter Chicken" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("Base price (₹)", <input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {field("Category",
            <select value={catId} onChange={(e) => setCatId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="">Select category</option>
              {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Type</div>
          <div style={{ display: "flex", gap: 8 }}>
            {([true, false] as const).map((v) => (
              <button key={String(v)} type="button" onClick={() => setIsVeg(v)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid " + (isVeg === v ? (v ? "var(--color-green)" : "var(--color-red)") : "var(--color-line)"), background: isVeg === v ? (v ? "var(--color-green-soft)" : "var(--color-red-soft)") : "var(--color-surface)", color: isVeg === v ? (v ? "var(--color-green)" : "var(--color-red)") : "var(--color-ink-3)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span className={`veg-dot ${v ? "veg" : "nonveg"}`} style={{ width: 10, height: 10 }} />{v ? "Veg" : "Non-veg"}
              </button>
            ))}
          </div>
        </div>
        {field("Description (optional)", <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description…" style={{ ...inputStyle({ height: 72, padding: "10px 14px", resize: "none" }), lineHeight: 1.5 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("HSN code (optional)", <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="e.g. 1902" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {taxConfigs.length > 0 && field("Tax config", (
            <select value={taxConfigId} onChange={(e) => setTaxConfigId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="">No tax</option>
              {taxConfigs.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.cgstRate}% + {t.sgstRate}%)</option>)}
            </select>
          ))}
        </div>
      </form>

      {/* Variants — only shown when editing an existing item */}
      {!isNew && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Variants (optional)</div>
          <div style={{ border: "1px solid var(--color-line)", borderRadius: 10, overflow: "hidden" }}>
            {variants.filter((v) => v.isActive).map((v, i, arr) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--color-line)" : "none", gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{v.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{formatCurrency(v.price)}</span>
                <button onClick={() => deleteVariantMutation.mutate(v.id)} style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-red)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--color-red-soft)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: variants.filter((v) => v.isActive).length > 0 ? "1px solid var(--color-line)" : "none" }}>
              <input value={newVarName} onChange={(e) => setNewVarName(e.target.value)} placeholder="Variant name (e.g. Large)" style={{ ...inputStyle({ height: 36 }), flex: 1 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
              <input type="number" min="0" step="0.5" value={newVarPrice} onChange={(e) => setNewVarPrice(e.target.value)} placeholder="₹0" style={{ ...inputStyle({ height: 36, fontFamily: "var(--font-mono)", width: 80 }) }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
              <button onClick={() => { if (newVarName.trim() && newVarPrice) addVariantMutation.mutate() }} disabled={!newVarName.trim() || !newVarPrice} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: (!newVarName.trim() || !newVarPrice) ? .4 : 1 }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier groups — only shown when editing an existing item */}
      {!isNew && allModifierGroups.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Modifier groups</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allModifierGroups.map((g) => {
              const linked = linkedGroupIds.has(g.id)
              return (
                <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid " + (linked ? "var(--color-ink)" : "var(--color-line)"), borderRadius: 10, cursor: "pointer", background: linked ? "var(--color-surface-2)" : "var(--color-surface)" }}>
                  <input type="checkbox" checked={linked} onChange={() => linked ? unlinkGroupMutation.mutate(g.id) : linkGroupMutation.mutate(g.id)} style={{ width: 16, height: 16, accentColor: "var(--color-ink)", cursor: "pointer" }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: linked ? 600 : 400 }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{g.required ? "Required" : "Optional"}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </SlidePanel>
  )
}

function MenuTab() {
  const qc = useQueryClient()
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<EditItem | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState("")
  const [hoveredCatId, setHoveredCatId] = useState<string | null>(null)

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: Category[]; items: MenuItemRow[]; variants: ItemVariant[]; modifierGroups: ModifierGroup[]; itemModifierGroups: ItemModifierGroupLink[]; taxConfigs: TaxConfig[] }> })
  const cats = menu?.categories ?? []
  const items = menu?.items ?? []
  const allModifierGroups = menu?.modifierGroups ?? []
  const itemModifierGroupLinks = menu?.itemModifierGroups ?? []
  const taxConfigs = (menu?.taxConfigs ?? []) as TaxConfig[]
  const activeCat = selectedCatId ?? cats.find((c) => c.isActive)?.id ?? null
  const visibleItems = items.filter((i) => i.categoryId === activeCat)

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] })

  const createCatMutation = useMutation({ mutationFn: (name: string) => api.menu.createCategory({ name }), onSuccess: () => { invalidate(); setAddingCat(false); setNewCatName("") } })
  const updateCatMutation = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.menu.updateCategory(id, { name }), onSuccess: invalidate })
  const deleteCatMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteCategory(id), onSuccess: (_, deletedId) => { invalidate(); setSelectedCatId((prev) => (prev === deletedId ? null : prev)) } })
  const toggleMutation = useMutation({ mutationFn: ({ id, val }: { id: string; val: boolean }) => api.menu.toggleAvailability(id, val), onSuccess: invalidate })
  const deleteItemMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteItem(id), onSuccess: invalidate })

  return (
    <>
      <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--color-line)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Menu</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>{items.length} items across {cats.filter((c) => c.isActive).length} categories</div>
        </div>
        <button onClick={() => setEditingItem({ _new: true, categoryId: activeCat ?? "", name: "", basePrice: "0", isVeg: true, description: "", hsnCode: "", taxConfigId: null })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add item
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Category sidebar */}
        <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--color-line)", overflow: "auto", padding: 8 }}>
          {cats.filter((c) => c.isActive).map((c) => (
            editingCatId === c.id ? (
              <form key={c.id} onSubmit={(e) => { e.preventDefault(); if (editingCatName.trim()) updateCatMutation.mutate({ id: c.id, name: editingCatName.trim() }); setEditingCatId(null) }} style={{ padding: "4px 8px" }}>
                <input autoFocus value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)}
                  style={{ width: "100%", height: 32, padding: "0 8px", border: "1.5px solid var(--color-ink-3)", borderRadius: 6, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  onBlur={() => { if (editingCatName.trim()) updateCatMutation.mutate({ id: c.id, name: editingCatName.trim() }); setEditingCatId(null) }}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingCatId(null) }} />
              </form>
            ) : (
              <div key={c.id} onClick={() => setSelectedCatId(c.id)}
                onMouseEnter={() => setHoveredCatId(c.id)}
                onMouseLeave={() => setHoveredCatId(null)}
                style={{ padding: "9px 12px", borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: activeCat === c.id ? 600 : 400, background: activeCat === c.id ? "var(--color-surface-2)" : hoveredCatId === c.id ? "var(--color-hover)" : "transparent", color: activeCat === c.id ? "var(--color-ink)" : "var(--color-ink-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                {hoveredCatId === c.id ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setEditingCatId(c.id); setEditingCatName(c.name) }} style={{ width: 20, height: 20, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${c.name}"?`)) deleteCatMutation.mutate(c.id) }} style={{ width: 20, height: 20, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>{items.filter((i) => i.categoryId === c.id).length}</span>
                )}
              </div>
            )
          ))}
          {addingCat ? (
            <form onSubmit={(e) => { e.preventDefault(); if (newCatName.trim()) createCatMutation.mutate(newCatName.trim()) }} style={{ padding: "6px 8px" }}>
              <input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" style={{ width: "100%", height: 36, padding: "0 10px", border: "1.5px solid var(--color-ink-3)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                onBlur={() => { if (!newCatName.trim()) setAddingCat(false) }}
                onKeyDown={(e) => { if (e.key === "Escape") setAddingCat(false) }} />
            </form>
          ) : (
            <button onClick={() => setAddingCat(true)} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent", color: "var(--color-ink-3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-hover)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>New category
            </button>
          )}
        </div>

        {/* Items list */}
        <div className="scroll" style={{ flex: 1 }}>
          {visibleItems.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--color-ink-3)" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>
              <div style={{ fontSize: 14 }}>No items in this category</div>
              <button onClick={() => setEditingItem({ _new: true, categoryId: activeCat ?? "", name: "", basePrice: "0", isVeg: true, description: "", hsnCode: "", taxConfigId: null })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>Add first item</button>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 80px 80px 80px", padding: "12px 28px", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500, borderBottom: "1px solid var(--color-line)" }}>
                <span/><span>Item</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "center" }}>Type</span><span style={{ textAlign: "center" }}>Status</span><span style={{ textAlign: "right" }}>Actions</span>
              </div>
              {visibleItems.map((item) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px 80px 80px 80px", padding: "14px 28px", alignItems: "center", borderBottom: "1px solid var(--color-line)", opacity: item.isAvailable ? 1 : .5 }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                  <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} style={{ width: 10, height: 10 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 1 }}>{item.description}</div>}
                  </div>
                  <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13 }}>{formatCurrency(item.basePrice)}</span>
                  <span style={{ textAlign: "center" }}><span className={`badge ${item.isVeg ? "green" : "red"}`} style={{ fontSize: 11 }}>{item.isVeg ? "Veg" : "Non-veg"}</span></span>
                  <span style={{ textAlign: "center" }}>
                    <button onClick={() => toggleMutation.mutate({ id: item.id, val: !item.isAvailable })} style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid " + (item.isAvailable ? "var(--color-green)" : "var(--color-line)"), background: item.isAvailable ? "var(--color-green-soft)" : "var(--color-surface-2)", color: item.isAvailable ? "var(--color-green)" : "var(--color-ink-3)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                      {item.isAvailable ? "On" : "Off"}
                    </button>
                  </span>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    <ActionBtn onClick={() => setEditingItem({ id: item.id, categoryId: item.categoryId, name: item.name, basePrice: item.basePrice, isVeg: item.isVeg, description: item.description ?? "", hsnCode: item.hsnCode ?? "", taxConfigId: item.taxConfigId ?? null })} title="Edit" />
                    <ActionBtn onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMutation.mutate(item.id) }} title="Delete" danger />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {editingItem && <ItemEditPanel item={editingItem} categories={cats} taxConfigs={taxConfigs} variants={(menu?.variants ?? []).filter((v) => v.itemId === editingItem.id)} allModifierGroups={allModifierGroups} itemModifierGroupLinks={itemModifierGroupLinks} onClose={() => setEditingItem(null)} onSaved={invalidate} />}
    </>
  )
}

// ── Tables tab ───────────────────────────────────────────────────────────────
function TableEditPanel({ table, floors, onClose, onSaved }: { table: EditTable; floors: Floor[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !!table._new
  const [name, setName] = useState(table.name)
  const [capacity, setCapacity] = useState(String(table.capacity))
  const [floorId, setFloorId] = useState(table.floorId)
  const canSave = name.trim() && parseInt(capacity) > 0 && floorId
  const createMutation = useMutation({ mutationFn: () => api.tables.createTable({ name, capacity: parseInt(capacity), floorId }), onSuccess: () => { onSaved(); onClose() } })
  const updateMutation = useMutation({ mutationFn: () => api.tables.updateTable(table.id!, { name, capacity: parseInt(capacity), floorId }), onSuccess: () => { onSaved(); onClose() } })
  const isPending = createMutation.isPending || updateMutation.isPending
  const doSave = () => { if (!canSave || isPending) return; isNew ? createMutation.mutate() : updateMutation.mutate() }
  return (
    <SlidePanel title={isNew ? "Add table" : `Edit ${table.name}`} onClose={onClose} footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={doSave} disabled={!canSave || isPending} label={isPending ? "Saving…" : isNew ? "Add table" : "Save"} /></>}>
      <form onSubmit={(e) => { e.preventDefault(); doSave() }} style={{ display: "contents" }}>
        {field("Table name / number", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. T1, Table 5" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("Capacity (seats)", <input type="number" min="1" max="50" value={capacity} onChange={(e) => setCapacity(e.target.value)} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {field("Floor / Section",
            <select value={floorId} onChange={(e) => setFloorId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="">Select floor</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
      </form>
    </SlidePanel>
  )
}

function TablesTab() {
  const qc = useQueryClient()
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)
  const [editingTable, setEditingTable] = useState<EditTable | null>(null)
  const [addingFloor, setAddingFloor] = useState(false)
  const [newFloorName, setNewFloorName] = useState("")
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null)
  const [editingFloorName, setEditingFloorName] = useState("")
  const [hoveredFloorId, setHoveredFloorId] = useState<string | null>(null)

  const { data } = useQuery({ queryKey: ["tables"], queryFn: () => api.tables.getAll() as Promise<{ floors: Floor[]; tables: TableRow[] }> })
  const floors = data?.floors ?? []
  const tables = data?.tables ?? []
  const activeFloor = activeFloorId ?? floors[0]?.id ?? null
  const floorTables = tables.filter((t) => t.floorId === activeFloor)

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tables"] })

  const createFloorMutation = useMutation({ mutationFn: (name: string) => api.tables.createFloor({ name }), onSuccess: () => { invalidate(); setAddingFloor(false); setNewFloorName("") } })
  const updateFloorMutation = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.tables.updateFloor(id, { name }), onSuccess: invalidate })
  const deleteFloorMutation = useMutation({ mutationFn: (id: string) => api.tables.deleteFloor(id), onSuccess: (_, deletedId) => { invalidate(); setActiveFloorId((prev) => (prev === deletedId ? null : prev)) } })
  const deleteTableMutation = useMutation({ mutationFn: (id: string) => api.tables.deleteTable(id), onSuccess: invalidate })

  const statusDot: Record<string, string> = { available: "green", occupied: "amber", billed: "red" }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--color-line)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tables</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>{tables.length} tables across {floors.length} floor{floors.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={() => setEditingTable({ _new: true, floorId: activeFloor ?? "", name: "", capacity: 4 })} disabled={!activeFloor} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", opacity: activeFloor ? 1 : .4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add table
        </button>
      </div>

      {/* Floor tabs */}
      <div style={{ display: "flex", gap: 0, padding: "0 20px", borderBottom: "1px solid var(--color-line)", alignItems: "center" }}>
        {floors.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", borderBottom: "2px solid " + (activeFloor === f.id ? "var(--color-ink)" : "transparent"), marginBottom: -1 }}
            onMouseEnter={() => setHoveredFloorId(f.id)}
            onMouseLeave={() => setHoveredFloorId(null)}>
            {editingFloorId === f.id ? (
              <form onSubmit={(e) => { e.preventDefault(); if (editingFloorName.trim()) updateFloorMutation.mutate({ id: f.id, name: editingFloorName.trim() }); setEditingFloorId(null) }} style={{ display: "flex", alignItems: "center" }}>
                <input autoFocus value={editingFloorName} onChange={(e) => setEditingFloorName(e.target.value)}
                  style={{ height: 32, padding: "0 10px", border: "1.5px solid var(--color-ink-3)", borderRadius: 6, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  onBlur={() => { if (editingFloorName.trim()) updateFloorMutation.mutate({ id: f.id, name: editingFloorName.trim() }); setEditingFloorId(null) }}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingFloorId(null) }} />
              </form>
            ) : (
              <button onClick={() => setActiveFloorId(f.id)} style={{ padding: "12px 12px", border: "none", background: "transparent", color: activeFloor === f.id ? "var(--color-ink)" : "var(--color-ink-3)", fontSize: 13, fontWeight: activeFloor === f.id ? 600 : 400, fontFamily: "inherit", cursor: "pointer" }}>
                {f.name} <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", marginLeft: 4 }}>{tables.filter((t) => t.floorId === f.id).length}</span>
              </button>
            )}
            {hoveredFloorId === f.id && editingFloorId !== f.id && (
              <div style={{ display: "flex", gap: 2, paddingRight: 4 }}>
                <button onClick={() => { setEditingFloorId(f.id); setEditingFloorName(f.name) }} style={{ width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>
                </button>
                <button onClick={() => { if (confirm(`Delete floor "${f.name}"? All tables on it must be removed first.`)) deleteFloorMutation.mutate(f.id) }} style={{ width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                </button>
              </div>
            )}
          </div>
        ))}
        {addingFloor ? (
          <form onSubmit={(e) => { e.preventDefault(); if (newFloorName.trim()) createFloorMutation.mutate(newFloorName.trim()) }} style={{ marginLeft: 8 }}>
            <input autoFocus value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)} placeholder="Floor name" style={{ height: 32, padding: "0 10px", border: "1.5px solid var(--color-ink-3)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              onBlur={() => { if (!newFloorName.trim()) setAddingFloor(false) }}
              onKeyDown={(e) => { if (e.key === "Escape") setAddingFloor(false) }} />
          </form>
        ) : (
          <button onClick={() => setAddingFloor(true)} style={{ marginLeft: 8, padding: "8px 12px", border: "1px dashed var(--color-line-strong)", borderRadius: 8, background: "transparent", color: "var(--color-ink-3)", fontSize: 12, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add floor
          </button>
        )}
      </div>

      {/* Tables grid */}
      <div className="scroll" style={{ flex: 1, padding: 24 }}>
        {floorTables.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12, color: "var(--color-ink-3)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
            <div style={{ fontSize: 14 }}>No tables on this floor</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {floorTables.map((t) => (
              <div key={t.id} style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: "14px 16px", background: "var(--color-surface)", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className={`dot ${statusDot[t.status] ?? "gray"}`} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{t.capacity} seats · <span style={{ textTransform: "capitalize" }}>{t.status}</span></div>
                <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                  <ActionBtn onClick={() => setEditingTable({ id: t.id, floorId: t.floorId, name: t.name, capacity: t.capacity })} title="Edit" />
                  <ActionBtn onClick={() => { if (t.status !== "available") { alert("Cannot delete a table with an active order"); return; } if (confirm(`Delete table "${t.name}"?`)) deleteTableMutation.mutate(t.id) }} title="Delete" danger />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editingTable && <TableEditPanel table={editingTable} floors={floors} onClose={() => setEditingTable(null)} onSaved={invalidate} />}
    </>
  )
}

// ── Tax & Charges tab ────────────────────────────────────────────────────────
function TaxTab() {
  const qc = useQueryClient()
  const [cgst, setCgst] = useState("")
  const [sgst, setSgst] = useState("")
  const [igst, setIgst] = useState("")
  const [name, setName] = useState("Default")
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: config } = useQuery({
    queryKey: ["tax"],
    queryFn: () => api.menu.getTax() as Promise<TaxConfig | null>,
  })

  if (config && !loaded) {
    setCgst(config.cgstRate)
    setSgst(config.sgstRate)
    setIgst(config.igstRate)
    setName(config.name)
    setLoaded(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => api.menu.saveTax({ name, cgstRate: parseFloat(cgst || "0"), sgstRate: parseFloat(sgst || "0"), igstRate: parseFloat(igst || "0") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax"] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  const subtotalExample = 1000
  const cgstAmt = subtotalExample * (parseFloat(cgst || "0") / 100)
  const sgstAmt = subtotalExample * (parseFloat(sgst || "0") / 100)
  const totalAmt = subtotalExample + cgstAmt + sgstAmt

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tax & Charges</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Applied to all orders at billing time</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "28px 32px" }}>
        <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
          {field("Config name", <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {field("CGST %", <input type="number" min="0" max="50" step="0.5" value={cgst} onChange={(e) => setCgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("SGST %", <input type="number" min="0" max="50" step="0.5" value={sgst} onChange={(e) => setSgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("IGST %", <input type="number" min="0" max="50" step="0.5" value={igst} onChange={(e) => setIgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          </div>

          {/* Live preview */}
          <div style={{ padding: 18, background: "var(--color-surface-2)", borderRadius: 12, border: "1px solid var(--color-line)" }}>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 500, marginBottom: 12 }}>Preview on ₹1,000 order</div>
            {[["Subtotal", formatCurrency(subtotalExample)], ...(cgstAmt > 0 ? [[`CGST (${cgst}%)`, formatCurrency(cgstAmt)]] : []), ...(sgstAmt > 0 ? [[`SGST (${sgst}%)`, formatCurrency(sgstAmt)]] : [])].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-ink-2)", padding: "3px 0" }}>
                <span>{label}</span><span style={{ fontFamily: "var(--font-mono)" }}>{val}</span>
              </div>
            ))}
            <div style={{ height: 1, background: "var(--color-line-strong)", margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 600 }}>
              <span>Total</span><span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(totalAmt)}</span>
            </div>
          </div>

          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={{ alignSelf: "flex-start", padding: "12px 24px", borderRadius: 10, border: "none", background: saved ? "var(--color-green)" : "var(--color-ink)", color: "var(--color-bg)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", transition: "background .2s" }}>
            {saved ? "Saved!" : saveMutation.isPending ? "Saving…" : "Save tax settings"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Shift Reports tab ────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Today", from: () => { const d = new Date(); return d.toISOString().split("T")[0]! }, to: () => { const d = new Date(); return d.toISOString().split("T")[0]! } },
  { label: "Yesterday", from: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]! }, to: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]! } },
  { label: "This week", from: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]! }, to: () => new Date().toISOString().split("T")[0]! },
  { label: "This month", from: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01` }, to: () => new Date().toISOString().split("T")[0]! },
]

type ItemReport    = { menuItemId: string; name: string; quantity: number; revenue: number }
type CategoryReport = { categoryId: string; name: string; quantity: number; revenue: number }
type HourlyReport  = { hour: number; revenue: number; count: number }
type FoodCostReport = { from: string; to: string; revenue: number; cogs: number; foodCostPct: number; byIngredient: { ingredientId: string; name: string; unit: string; qty: number; cost: number }[] }

function ShiftsTab() {
  const today = new Date().toISOString().split("T")[0]!
  const [from, setFrom]   = useState(today)
  const [to, setTo]       = useState(today)
  const [preset, setPreset] = useState(0)
  const [subTab, setSubTab] = useState<"summary" | "items" | "categories" | "hourly" | "food-cost">("summary")

  function applyPreset(idx: number) {
    setPreset(idx)
    setFrom(PRESETS[idx]!.from())
    setTo(PRESETS[idx]!.to())
  }

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["report.summary", from, to],
    queryFn: () => api.reports.summary(from, to) as Promise<ReportSummary>,
    enabled: subTab === "summary",
  })

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["report.items", from, to],
    queryFn: () => api.reports.items(from, to) as Promise<ItemReport[]>,
    enabled: subTab === "items",
  })

  const { data: catsData, isLoading: catsLoading } = useQuery({
    queryKey: ["report.categories", from, to],
    queryFn: () => api.reports.categories(from, to) as Promise<CategoryReport[]>,
    enabled: subTab === "categories",
  })

  const { data: hourlyData, isLoading: hourlyLoading } = useQuery({
    queryKey: ["report.hourly", to],
    queryFn: () => api.reports.hourly(to) as Promise<HourlyReport[]>,
    enabled: subTab === "hourly",
  })

  const { data: foodCostData, isLoading: foodCostLoading } = useQuery({
    queryKey: ["report.food-cost", from, to],
    queryFn: () => api.reports.foodCost(from, to) as Promise<FoodCostReport>,
    enabled: subTab === "food-cost",
  })

  const statCard = (label: string, value: string, sub?: string) => (
    <div style={{ padding: "18px 20px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)", letterSpacing: "-.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 4 }}>{sub}</div>}
    </div>
  )

  const maxHourlyRevenue = hourlyData ? Math.max(...hourlyData.map((h) => h.revenue), 1) : 1

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Reports</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Revenue and sales breakdown</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => api.reports.exportBillsCsv(from, to)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Bills CSV
          </button>
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Date range selector */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => applyPreset(i)} style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid " + (preset === i ? "var(--color-ink)" : "var(--color-line)"), background: preset === i ? "var(--color-ink)" : "var(--color-surface)", color: preset === i ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(-1) }} style={{ height: 36, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <span style={{ alignSelf: "center", color: "var(--color-ink-3)" }}>–</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(-1) }} style={{ height: 36, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* Sub-tab selector */}
        <div style={{ display: "flex", gap: 4, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {(["summary", "items", "categories", "hourly", "food-cost"] as const).map((t) => (
            <button key={t} onClick={() => setSubTab(t)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: subTab === t ? "var(--color-surface)" : "transparent", boxShadow: subTab === t ? "var(--shadow-1)" : "none", fontSize: 13, fontWeight: subTab === t ? 600 : 400, color: subTab === t ? "var(--color-ink)" : "var(--color-ink-3)", cursor: "pointer", fontFamily: "inherit", transition: "all .1s", textTransform: "capitalize" }}>
              {t === "food-cost" ? "Food Cost" : t}
            </button>
          ))}
        </div>

        {/* Summary */}
        {subTab === "summary" && (sumLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : summary ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
              {statCard("Total Revenue", formatCurrency(summary.totalRevenue), `${summary.billCount} bill${summary.billCount !== 1 ? "s" : ""}`)}
              {statCard("Tax Collected", formatCurrency(summary.totalTax))}
              {statCard("Discounts Given", formatCurrency(summary.totalDiscount))}
              {statCard("Bills", String(summary.billCount))}
            </div>
            {Object.keys(summary.byPaymentMode).length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>By Payment Mode</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {Object.entries(summary.byPaymentMode).map(([mode, amount]) => (
                    <div key={mode} style={{ padding: "12px 18px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 10, minWidth: 130 }}>
                      <div style={{ fontSize: 11, color: "var(--color-ink-3)", textTransform: "capitalize", marginBottom: 4 }}>{mode}</div>
                      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{formatCurrency(amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {summary.billCount === 0 && <div style={{ color: "var(--color-ink-3)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>No paid bills in this period</div>}
          </>
        ) : null)}

        {/* By Item */}
        {subTab === "items" && (itemsLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              <span>Item</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Revenue</span>
            </div>
            {!itemsData || itemsData.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-ink-3)", fontSize: 14 }}>No data in this period</div>
            ) : itemsData.map((row, i) => (
              <div key={row.menuItemId} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "12px 16px", borderBottom: i < itemsData.length - 1 ? "1px solid var(--color-line)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink)" }}>{row.name}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{row.quantity}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{formatCurrency(row.revenue)}</span>
              </div>
            ))}
          </div>
        ))}

        {/* By Category */}
        {subTab === "categories" && (catsLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              <span>Category</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Revenue</span>
            </div>
            {!catsData || catsData.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-ink-3)", fontSize: 14 }}>No data in this period</div>
            ) : catsData.map((row, i) => (
              <div key={row.categoryId} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "12px 16px", borderBottom: i < catsData.length - 1 ? "1px solid var(--color-line)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink)" }}>{row.name}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{row.quantity}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{formatCurrency(row.revenue)}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Hourly (for selected "to" date) */}
        {subTab === "hourly" && (hourlyLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : (
          <>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: -8 }}>Showing data for {to}</div>
            {!hourlyData || hourlyData.length === 0 ? (
              <div style={{ color: "var(--color-ink-3)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>No paid bills on this date</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hourlyData.map((row) => {
                  const pct = (row.revenue / maxHourlyRevenue) * 100
                  const h = row.hour % 12 || 12
                  const ampm = row.hour < 12 ? "am" : "pm"
                  return (
                    <div key={row.hour} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 56, fontSize: 12, color: "var(--color-ink-3)", textAlign: "right", flexShrink: 0, fontFamily: "var(--font-mono)" }}>{h}:00{ampm}</div>
                      <div style={{ flex: 1, height: 28, background: "var(--color-surface-2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-accent)", borderRadius: 6, transition: "width .3s ease" }} />
                      </div>
                      <div style={{ width: 90, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.revenue)}</div>
                      <div style={{ width: 36, textAlign: "right", fontSize: 11, color: "var(--color-ink-3)", flexShrink: 0 }}>{row.count}×</div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ))}

        {/* Food Cost */}
        {subTab === "food-cost" && (foodCostLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : foodCostData ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {statCard("Revenue", formatCurrency(foodCostData.revenue))}
              {statCard("Cost of Goods (COGS)", formatCurrency(foodCostData.cogs))}
              {statCard("Food Cost %", `${foodCostData.foodCostPct}%`, foodCostData.foodCostPct < 30 ? "Healthy" : foodCostData.foodCostPct < 40 ? "Moderate" : "High")}
            </div>
            {foodCostData.byIngredient.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Cost Breakdown by Ingredient</div>
                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                    <span>Ingredient</span><span style={{ textAlign: "right" }}>Qty Used</span><span style={{ textAlign: "right" }}>Unit</span><span style={{ textAlign: "right" }}>Cost</span>
                  </div>
                  {foodCostData.byIngredient.map((row, i) => (
                    <div key={row.ingredientId} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 100px", padding: "11px 16px", borderBottom: i < foodCostData.byIngredient.length - 1 ? "1px solid var(--color-line)" : "none", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{row.name}</span>
                      <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{row.qty.toFixed(3)}</span>
                      <span style={{ textAlign: "right", fontSize: 13, color: "var(--color-ink-3)" }}>{row.unit}</span>
                      <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{formatCurrency(row.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--color-ink-3)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
                No ingredient deductions in this period. Add recipes to menu items to track food cost.
              </div>
            )}
          </>
        ) : null)}
      </div>
    </>
  )
}

// ── Outlet settings tab ──────────────────────────────────────────────────────
function OutletTab() {
  const qc = useQueryClient()
  const [name, setName]               = useState("")
  const [address, setAddress]         = useState("")
  const [phone, setPhone]             = useState("")
  const [gstin, setGstin]             = useState("")
  const [upiVpa, setUpiVpa]           = useState("")
  const [razorpayKeyId, setRazorpayKeyId]         = useState("")
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("")
  const [loaded, setLoaded]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const { data: outlet } = useQuery({
    queryKey: ["outlet"],
    queryFn: () => api.outlet.get() as Promise<OutletInfo>,
  })

  if (outlet && !loaded) {
    setName(outlet.name)
    setAddress(outlet.address)
    setPhone(outlet.phone)
    setGstin(outlet.gstin ?? "")
    setUpiVpa(outlet.upiVpa ?? "")
    setRazorpayKeyId(outlet.razorpayKeyId ?? "")
    setLoaded(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => api.outlet.update({
      name, address, phone,
      gstin: gstin || undefined,
      upiVpa: upiVpa || undefined,
      razorpayKeyId: razorpayKeyId || undefined,
      razorpayKeySecret: razorpayKeySecret || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outlet"] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Outlet Settings</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Shown on printed receipts</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "28px 32px" }}>
        <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
          {field("Outlet name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Spice Garden" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {field("Address", <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state, PIN" style={{ ...inputStyle({ height: 80, padding: "10px 14px", resize: "none" }), lineHeight: 1.5 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {field("Phone", <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          {field("GSTIN (optional)", <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" style={inputStyle({ fontFamily: "var(--font-mono)", letterSpacing: ".05em" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}

          {/* UPI / Payment section */}
          <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginBottom: 16 }}>UPI &amp; Payments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {field("UPI VPA (e.g. outlet@upi)", (
                <div>
                  <input value={upiVpa} onChange={(e) => setUpiVpa(e.target.value.trim())} placeholder="merchant@ybl" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                  <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 5 }}>Used to generate UPI QR codes on the billing screen. Customers scan and pay directly.</div>
                </div>
              ))}
              {field("Razorpay Key ID (optional)", (
                <input value={razorpayKeyId} onChange={(e) => setRazorpayKeyId(e.target.value.trim())} placeholder="rzp_live_…" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
              ))}
              {field("Razorpay Key Secret (optional)", (
                <input type="password" value={razorpayKeySecret} onChange={(e) => setRazorpayKeySecret(e.target.value.trim())} placeholder="Leave blank to keep existing" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
              ))}
            </div>
          </div>

          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} style={{ alignSelf: "flex-start", padding: "12px 24px", borderRadius: 10, border: "none", background: saved ? "var(--color-green)" : "var(--color-ink)", color: "var(--color-bg)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", transition: "background .2s", opacity: !name.trim() ? .4 : 1 }}>
            {saved ? "Saved!" : saveMutation.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Modifiers tab ────────────────────────────────────────────────────────────
function ModifiersTab() {
  const qc = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [newGroupMulti, setNewGroupMulti] = useState(false)
  const [newModName, setNewModName] = useState("")
  const [newModPrice, setNewModPrice] = useState("")

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ modifierGroups: ModifierGroup[]; modifiers: Modifier[] }> })
  const groups = menu?.modifierGroups ?? []
  const allMods = menu?.modifiers ?? []
  const groupModifiers = allMods.filter((m) => m.groupId === selectedGroupId && m.isActive)
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] })

  const createGroupMutation = useMutation({
    mutationFn: () => api.menu.createModifierGroup({ name: newGroupName.trim(), required: newGroupRequired, multiSelect: newGroupMulti, minSelect: 0 }),
    onSuccess: () => { invalidate(); setNewGroupName(""); setNewGroupRequired(false); setNewGroupMulti(false) },
  })
  const deleteGroupMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteModifierGroup(id), onSuccess: (_, id) => { invalidate(); if (selectedGroupId === id) setSelectedGroupId(null) } })
  const addModMutation = useMutation({
    mutationFn: () => api.menu.addModifier(selectedGroupId!, { name: newModName.trim(), price: parseFloat(newModPrice) || 0 }),
    onSuccess: () => { invalidate(); setNewModName(""); setNewModPrice("") },
  })
  const deleteModMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteModifier(id), onSuccess: invalidate })

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Modifier Groups</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Add-on groups attached to menu items (e.g. "Spice Level", "Extra Toppings")</div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--color-line)", overflow: "auto", padding: 8 }}>
          {groups.map((g) => (
            <div key={g.id} onClick={() => setSelectedGroupId(g.id)}
              style={{ padding: "9px 12px", borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: selectedGroupId === g.id ? 600 : 400, background: selectedGroupId === g.id ? "var(--color-surface-2)" : "transparent", color: "var(--color-ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              onMouseEnter={(e) => { if (selectedGroupId !== g.id) (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)" }}
              onMouseLeave={(e) => { if (selectedGroupId !== g.id) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
              {g.required && <span style={{ fontSize: 10, color: "var(--color-red)", fontWeight: 600 }}>REQ</span>}
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete group "${g.name}"?`)) deleteGroupMutation.mutate(g.id) }} style={{ width: 20, height: 20, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-4)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-red)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-4)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              </button>
            </div>
          ))}
          <div style={{ padding: "8px", borderTop: groups.length > 0 ? "1px solid var(--color-line)" : "none", marginTop: groups.length > 0 ? 4 : 0 }}>
            <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="New group name" style={{ width: "100%", height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit", marginBottom: 6 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-ink-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} /> Required
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-ink-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={newGroupMulti} onChange={(e) => setNewGroupMulti(e.target.checked)} /> Multi
              </label>
            </div>
            <button onClick={() => { if (newGroupName.trim()) createGroupMutation.mutate() }} disabled={!newGroupName.trim()} style={{ width: "100%", height: 34, borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !newGroupName.trim() ? .4 : 1 }}>Add group</button>
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 24 }}>
          {!selectedGroup ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-ink-3)", fontSize: 14 }}>Select a group to manage its options</div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{selectedGroup.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>{selectedGroup.required ? "Required · " : "Optional · "}{selectedGroup.multiSelect ? "Multi-select" : "Single-select"}</div>
              </div>
              <div style={{ border: "1px solid var(--color-line)", borderRadius: 10, overflow: "hidden" }}>
                {groupModifiers.length === 0 && <div style={{ padding: "14px 16px", color: "var(--color-ink-3)", fontSize: 13 }}>No options yet</div>}
                {groupModifiers.map((m, i) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: i < groupModifiers.length - 1 ? "1px solid var(--color-line)" : "none", gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 14 }}>{m.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: Number(m.price) > 0 ? "var(--color-ink)" : "var(--color-ink-3)" }}>{Number(m.price) > 0 ? `+${formatCurrency(m.price)}` : "Free"}</span>
                    <button onClick={() => deleteModMutation.mutate(m.id)} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-red)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--color-red-soft)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: groupModifiers.length > 0 ? "1px solid var(--color-line)" : "none" }}>
                  <input value={newModName} onChange={(e) => setNewModName(e.target.value)} placeholder="Option name" style={{ ...inputStyle({ height: 36 }), flex: 1 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                  <input type="number" min="0" step="0.5" value={newModPrice} onChange={(e) => setNewModPrice(e.target.value)} placeholder="₹0" style={{ ...inputStyle({ height: 36, fontFamily: "var(--font-mono)", width: 80 }) }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                  <button onClick={() => { if (newModName.trim()) addModMutation.mutate() }} disabled={!newModName.trim()} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !newModName.trim() ? .4 : 1 }}>Add</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Customers tab ────────────────────────────────────────────────────────────
type Customer = { id: string; name: string | null; phone: string; loyaltyPoints: number; createdAt: string }

function CustomersTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Customer | null>(null)
  const [loyaltyDelta, setLoyaltyDelta] = useState("")
  const [loyaltyNote, setLoyaltyNote] = useState("")

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.customers.search(search) as Promise<Customer[]>,
    staleTime: 10_000,
  })

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["customers"] }); setSelected(null) }
  const loyaltyMutation = useMutation({
    mutationFn: () => api.customers.addLoyalty(selected!.id, parseFloat(loyaltyDelta), loyaltyNote),
    onSuccess: () => { invalidate(); setLoyaltyDelta(""); setLoyaltyNote("") },
  })

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Customers</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Takeaway and delivery customer records with loyalty points</div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--color-line)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-line)" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" style={{ width: "100%", height: 36, padding: "0 12px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          </div>
          <div className="scroll" style={{ flex: 1 }}>
            {isFetching && results.length === 0 && <div style={{ padding: 20, color: "var(--color-ink-3)", fontSize: 13 }}>Searching…</div>}
            {results.map((c) => (
              <div key={c.id} onClick={() => setSelected(c)} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--color-line)", background: selected?.id === c.id ? "var(--color-surface-2)" : "transparent" }}
                onMouseEnter={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)" }}
                onMouseLeave={(e) => { if (selected?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name ?? "—"}</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{c.phone}</span>
                  <span>{c.loyaltyPoints} pts</span>
                </div>
              </div>
            ))}
            {!isFetching && results.length === 0 && <div style={{ padding: 24, color: "var(--color-ink-3)", fontSize: 13, textAlign: "center" }}>No customers found</div>}
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, padding: 28 }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-ink-3)", fontSize: 14 }}>Select a customer</div>
          ) : (
            <div style={{ maxWidth: 440 }}>
              <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{selected.name ?? "Unknown"}</div>
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-3)", marginBottom: 20 }}>{selected.phone}</div>
              <div style={{ padding: "18px 20px", background: "var(--color-surface-2)", borderRadius: 12, border: "1px solid var(--color-line)", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>Loyalty Points</div>
                  <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{selected.loyaltyPoints}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Since {new Date(selected.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Adjust loyalty points</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="number" value={loyaltyDelta} onChange={(e) => setLoyaltyDelta(e.target.value)} placeholder="Points (positive = add, negative = redeem)" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                <input value={loyaltyNote} onChange={(e) => setLoyaltyNote(e.target.value)} placeholder="Note (optional)" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                <button onClick={() => loyaltyMutation.mutate()} disabled={!loyaltyDelta || loyaltyMutation.isPending} style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !loyaltyDelta ? .4 : 1 }}>
                  {loyaltyMutation.isPending ? "Saving…" : "Apply"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Expenses tab ─────────────────────────────────────────────────────────────
type CashEntry = { id: string; type: "in" | "out"; amount: string; note: string | null; createdAt: string }

function ExpensesTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().split("T")[0]!
  const [from, setFrom] = useState(today)
  const [to, setTo]     = useState(today)
  const [entryType, setEntryType] = useState<"in" | "out">("out")
  const [amount, setAmount]       = useState("")
  const [note, setNote]           = useState("")

  const { data: entries = [] } = useQuery({
    queryKey: ["cash-entries", from, to],
    queryFn: () => api.cashEntries.list(from, to) as Promise<CashEntry[]>,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cash-entries"] })
  const createMutation = useMutation({
    mutationFn: () => api.cashEntries.create({ type: entryType, amount: parseFloat(amount), note: note || undefined }),
    onSuccess: () => { invalidate(); setAmount(""); setNote("") },
  })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.cashEntries.delete(id), onSuccess: invalidate })

  const totalOut = entries.filter((e) => e.type === "out").reduce((s, e) => s + Number(e.amount), 0)
  const totalIn  = entries.filter((e) => e.type === "in").reduce((s, e) => s + Number(e.amount), 0)

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Expenses & Cash</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Cash drawer in/out entries, linked to the open shift</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <span style={{ color: "var(--color-ink-3)" }}>–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13 }}>
            <span>Cash In: <b style={{ fontFamily: "var(--font-mono)", color: "var(--color-green)" }}>{formatCurrency(totalIn)}</b></span>
            <span>Cash Out: <b style={{ fontFamily: "var(--font-mono)", color: "var(--color-red)" }}>{formatCurrency(totalOut)}</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 20, padding: "14px 18px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["out", "in"] as const).map((t) => (
              <button key={t} onClick={() => setEntryType(t)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + (entryType === t ? "var(--color-ink)" : "var(--color-line)"), background: entryType === t ? "var(--color-ink)" : "transparent", color: entryType === t ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                {t === "out" ? "Expense" : "Cash In"}
              </button>
            ))}
          </div>
          <input type="number" min="0" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Amount" style={{ ...inputStyle({ height: 38, width: 120, fontFamily: "var(--font-mono)" }) }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (supplies, petty cash…)" style={{ ...inputStyle({ height: 38 }), flex: 1 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
          <button onClick={() => { if (amount) createMutation.mutate() }} disabled={!amount || createMutation.isPending} style={{ height: 38, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !amount ? .4 : 1, flexShrink: 0 }}>Add</button>
        </div>
        <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
          {entries.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--color-ink-3)", fontSize: 13 }}>No entries in this period</div>}
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "12px 18px", borderBottom: i < entries.length - 1 ? "1px solid var(--color-line)" : "none", gap: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.type === "in" ? "var(--color-green)" : "var(--color-red)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13 }}>{e.note ?? (e.type === "in" ? "Cash in" : "Expense")}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: e.type === "in" ? "var(--color-green)" : "var(--color-red)" }}>{e.type === "in" ? "+" : "−"}{formatCurrency(e.amount)}</span>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={() => deleteMutation.mutate(e.id)} style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-4)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={(e2) => { (e2.currentTarget as HTMLButtonElement).style.color = "var(--color-red)"; (e2.currentTarget as HTMLButtonElement).style.background = "var(--color-red-soft)" }}
                onMouseLeave={(e2) => { (e2.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-4)"; (e2.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Devices tab (placeholder) ────────────────────────────────────────────────
function DevicesTab() {
  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Devices</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Connected terminals on this network</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--color-ink-3)" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5a10 10 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>
        <div style={{ fontSize: 14 }}>Device management coming soon</div>
      </div>
    </>
  )
}

// ── Discounts tab ────────────────────────────────────────────────────────────
function DiscountsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Partial<DiscountRow> & { _new?: boolean } | null>(null)
  const [err, setErr] = useState("")

  const { data: rows = [] } = useQuery({ queryKey: ["discounts"], queryFn: () => api.discounts.list() as Promise<DiscountRow[]> })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["discounts"] }); setEditing(null); setErr("") }

  const createMutation = useMutation({ mutationFn: (d: object) => api.discounts.create(d), onSuccess: invalidate, onError: (e: Error) => setErr(e.message) })
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: { id: string } & object) => api.discounts.update(id, d), onSuccess: invalidate, onError: (e: Error) => setErr(e.message) })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.discounts.delete(id), onSuccess: invalidate, onError: (e: Error) => setErr(e.message) })
  const toggleMutation = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.discounts.update(id, { isActive }), onSuccess: invalidate })

  function handleSave() {
    if (!editing) return
    const { _new, id, ...rest } = editing
    if (!rest.name?.trim() || !rest.value) { setErr("Name and value are required"); return }
    const payload = {
      name: rest.name.trim(),
      type: rest.type ?? "percentage",
      value: parseFloat(String(rest.value)),
      minOrderValue: parseFloat(String(rest.minOrderValue ?? 0)),
      maxDiscountAmount: rest.maxDiscountAmount ? parseFloat(String(rest.maxDiscountAmount)) : undefined,
      code: rest.code?.trim() || undefined,
      validFrom: rest.validFrom || undefined,
      validTo: rest.validTo || undefined,
      usageLimit: rest.usageLimit ?? undefined,
      isActive: rest.isActive ?? true,
    }
    if (_new) createMutation.mutate(payload)
    else updateMutation.mutate({ id: id!, ...payload })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const blank: Partial<DiscountRow> & { _new?: boolean } = { _new: true, type: "percentage", value: "", minOrderValue: "0", isActive: true }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--color-line)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Discounts</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Bill discounts and coupon codes applied at checkout</div>
        </div>
        <button onClick={() => { setEditing(blank); setErr("") }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>New discount
        </button>
      </div>

      <div className="scroll" style={{ flex: 1, padding: "20px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 && !editing && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--color-ink-3)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
            <div style={{ fontSize: 14 }}>No discounts yet</div>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, opacity: row.isActive ? 1 : .5 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2, display: "flex", gap: 10 }}>
                <span>{row.type === "percentage" ? `${row.value}% off` : `₹${row.value} off`}</span>
                {Number(row.minOrderValue) > 0 && <span>· min ₹{row.minOrderValue}</span>}
                {row.code && <span>· code: <code style={{ fontFamily: "var(--font-mono)", background: "var(--color-surface-2)", padding: "1px 5px", borderRadius: 4 }}>{row.code}</code></span>}
                {row.usageLimit && <span>· {row.usageCount}/{row.usageLimit} used</span>}
              </div>
            </div>
            <button onClick={() => toggleMutation.mutate({ id: row.id, isActive: !row.isActive })} style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid " + (row.isActive ? "var(--color-green)" : "var(--color-line)"), background: row.isActive ? "var(--color-green-soft)" : "var(--color-surface-2)", color: row.isActive ? "var(--color-green)" : "var(--color-ink-3)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              {row.isActive ? "Active" : "Off"}
            </button>
            <ActionBtn onClick={() => { setEditing({ ...row }); setErr("") }} title="Edit" />
            <ActionBtn onClick={() => { if (confirm(`Delete "${row.name}"?`)) deleteMutation.mutate(row.id) }} title="Delete" danger />
          </div>
        ))}
      </div>

      {editing && (
        <SlidePanel title={editing._new ? "New discount" : `Edit "${editing.name}"`} onClose={() => setEditing(null)}
          footer={<><CancelBtn onClose={() => setEditing(null)} /><SaveBtn onClick={handleSave} disabled={isPending} label={isPending ? "Saving…" : editing._new ? "Create" : "Save"} /></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {err && <div style={{ padding: "10px 14px", background: "var(--color-red-soft)", color: "var(--color-red)", borderRadius: 8, fontSize: 13 }}>{err}</div>}
            {field("Discount name", <input value={editing.name ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, name: e.target.value }))} placeholder="e.g. Happy Hour, Staff Discount" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Type", (
                <select value={editing.type ?? "percentage"} onChange={(e) => setEditing((d) => ({ ...d!, type: e.target.value as "percentage" | "flat" }))} style={{ ...inputStyle(), appearance: "none" }}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat amount (₹)</option>
                </select>
              ))}
              {field(editing.type === "flat" ? "Amount (₹)" : "Percentage (%)", <input type="number" min="0" step="0.01" value={editing.value ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, value: e.target.value }))} placeholder={editing.type === "flat" ? "e.g. 50" : "e.g. 10"} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Min order value (₹)", <input type="number" min="0" value={editing.minOrderValue ?? "0"} onChange={(e) => setEditing((d) => ({ ...d!, minOrderValue: e.target.value }))} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
              {field("Max discount cap (₹, optional)", <input type="number" min="0" value={editing.maxDiscountAmount ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, maxDiscountAmount: e.target.value || null }))} placeholder="No cap" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
            {field("Coupon code (optional)", <input value={editing.code ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, code: e.target.value.toUpperCase() }))} placeholder="e.g. HAPPY10 — leave blank for staff-applied only" style={inputStyle({ fontFamily: "var(--font-mono)", letterSpacing: ".05em" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Valid from (optional)", <input type="date" value={editing.validFrom?.split("T")[0] ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, validFrom: e.target.value || null }))} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
              {field("Valid to (optional)", <input type="date" value={editing.validTo?.split("T")[0] ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, validTo: e.target.value || null }))} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
            {field("Usage limit (optional)", <input type="number" min="1" value={editing.usageLimit ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, usageLimit: e.target.value ? parseInt(e.target.value) : null }))} placeholder="Unlimited" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
          </div>
        </SlidePanel>
      )}
    </>
  )
}

// ── Nav sidebar ──────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: "staff",     label: "Staff & PINs" },
  { id: "menu",      label: "Menu" },
  { id: "modifiers", label: "Modifiers" },
  { id: "tables",    label: "Tables" },
  { id: "taxes",     label: "Tax & Charges" },
  { id: "discounts", label: "Discounts" },
  { id: "shifts",    label: "Shift Reports" },
  { id: "customers", label: "Customers" },
  { id: "expenses",  label: "Expenses" },
  { id: "outlet",    label: "Outlet Settings" },
  { id: "devices",   label: "Devices" },
]

const NAV_ICONS: Record<NavId, React.ReactElement> = {
  staff:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><path d="M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7"/></svg>,
  menu:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>,
  modifiers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>,
  tables:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>,
  taxes:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M5 10v.01M19 15v.01"/></svg>,
  discounts: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>,
  shifts:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  customers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  expenses:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  outlet:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  devices:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5a10 10 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const [activeTab, setActiveTab] = useState<NavId>("staff")

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
      <TopBar current="manager" />
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--color-line)", background: "var(--color-surface)", padding: 14, overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id
            return (
              <div key={item.id} onClick={() => setActiveTab(item.id)} style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 2, display: "flex", alignItems: "center", gap: 10, background: active ? "var(--color-surface-2)" : "transparent", fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "var(--color-ink)" : "var(--color-ink-2)", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)" }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}>
                {NAV_ICONS[item.id]}
                <span style={{ flex: 1 }}>{item.label}</span>
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {activeTab === "staff"     && <StaffTab />}
          {activeTab === "menu"      && <MenuTab />}
          {activeTab === "modifiers" && <ModifiersTab />}
          {activeTab === "tables"    && <TablesTab />}
          {activeTab === "taxes"     && <TaxTab />}
          {activeTab === "discounts" && <DiscountsTab />}
          {activeTab === "shifts"    && <ShiftsTab />}
          {activeTab === "customers" && <CustomersTab />}
          {activeTab === "expenses"  && <ExpensesTab />}
          {activeTab === "outlet"    && <OutletTab />}
          {activeTab === "devices"   && <DevicesTab />}
        </div>
      </div>
    </div>
  )
}
