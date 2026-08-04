import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { QRCode } from "react-qr-code"
import { api, ApiError, type ExtractedMenu, type ExtractedItem, type ExtractedModifierGroup } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency, triggerPrint } from "@/lib/utils"
import { lineTotal, FEATURES } from "@inbill/shared"
import { useFeature, isUsable } from "@/hooks/useEntitlement"
import { LockBadge, billingUrl } from "@/components/Entitlement"
import { useUpgradeStore } from "@/stores/upgrade"
import { useAuthStore } from "@/stores/auth"
import { useIsTablet, useIsMobile } from "@/hooks/useMediaQuery"
import { LogoMark } from "@/components/ui/LogoMark"
import { ResponsiveListHeader, ResponsiveListRow } from "@/components/ui/ResponsiveList"
import { OperationTypeCards, operationTypeFromSettings, operationTypeToSettings, type OperationType } from "@/components/ui/OperationTypeCards"

// ── Types ────────────────────────────────────────────────────────────────────
type Staff = { id: string; name: string; role: string; isActive: boolean }
type EditRecord = { _new?: boolean; id?: string; name: string; role: string; pin: string; isActive: boolean }

type Category = { id: string; name: string; sortOrder: number; isActive: boolean; scheduleId?: string | null; stationId?: string | null }
type MenuItemRow = { id: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; isAvailable: boolean; description?: string; hsnCode?: string; taxConfigId?: string | null; scheduleId?: string | null; stationId?: string | null }
type Station = { id: string; name: string; color: string; sortOrder: number; isActive: boolean }
type MenuSchedule = { id: string; name: string; days: number[]; startTime: string; endTime: string; percentOff: string; isActive: boolean; activeNow?: boolean }
type ItemVariant = { id: string; itemId: string; name: string; price: string; isActive: boolean }
type ModifierGroup = { id: string; name: string; required: boolean; multiSelect: boolean; minSelect: number; maxSelect?: number | null }
type Modifier = { id: string; groupId: string; name: string; price: string; isActive: boolean }
type ItemModifierGroupLink = { itemId: string; groupId: string }
type EditItem = { _new?: boolean; id?: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; description: string; hsnCode?: string; taxConfigId?: string | null; scheduleId?: string | null; stationId?: string | null }

type DiscountRow = { id: string; name: string; type: "percentage" | "flat"; value: string; minOrderValue: string; maxDiscountAmount?: string | null; code?: string | null; validFrom?: string | null; validTo?: string | null; usageLimit?: number | null; usageCount: number; isActive: boolean }
type ChargeRow = { id: string; name: string; type: "percentage" | "flat"; value: string; isActive: boolean }

type Floor = { id: string; name: string; sortOrder: number }
type TableRow = { id: string; floorId: string; name: string; capacity: number; status: string }
type EditTable = { _new?: boolean; id?: string; floorId: string; name: string; capacity: number }

type TaxConfig = { id?: string; name: string; cgstRate: string; sgstRate: string; igstRate: string }

type ReportSummary = { billCount: number; totalRevenue: number; totalTax: number; totalDiscount: number; byPaymentMode: Record<string, number> }
type OutletInfo = { id: string; name: string; address: string; phone: string; gstin?: string; fssaiNumber?: string; timezone: string; currency: string; upiVpa?: string; razorpayKeyId?: string; settings?: { deliveryEnabled?: boolean; hasTables?: boolean; hasKitchenWorkflow?: boolean } }

// ── Constants ────────────────────────────────────────────────────────────────
const ROLES = ["manager", "cashier", "captain", "kitchen", "host"] as const
const ROLE_COLOR: Record<string, string> = { manager: "red", cashier: "blue", captain: "amber", kitchen: "green", host: "gray" }
const WEAK_PINS = new Set(["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321","1212","0101","1122"])
const ROLE_DESCRIPTION: Record<string, string> = { manager: "All access", cashier: "POS & billing", captain: "Take orders", kitchen: "KDS only", host: "Queue & seating" }
type NavId = "home" | "staff" | "menu" | "tables" | "taxes" | "modifiers" | "discounts" | "schedules" | "stations" | "shifts" | "bills" | "dayclose" | "activity" | "customers" | "loyalty" | "expenses" | "outlet" | "devices" | "reservations" | "billing"

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
        : title === "QR"
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M14 17h3M17 14h3v3M17 20h3"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      }
    </button>
  )
}

// ── Staff tab ────────────────────────────────────────────────────────────────
function StaffEditPanel({ record, onClose, onSaved }: { record: EditRecord; onClose: () => void; onSaved: () => void }) {
  const isNew = !!record._new
  const qc = useQueryClient()
  const isOwner = useAuthStore((s) => s.user?.role === "owner")
  const [name, setName] = useState(record.name)
  const [role, setRole] = useState(record.role || "captain")
  const [pin, setPin] = useState(isNew ? "" : "••••")
  const [error, setError] = useState<string | null>(null)

  const pinChanged = pin !== "••••" && pin !== ""
  const isWeakPin = pinChanged && pin.length === 4 && WEAK_PINS.has(pin)
  const canSave = name.trim() && name.trim().length <= 100 &&
    (isNew ? pin.length === 4 && !isWeakPin : (!pinChanged || (pin.length === 4 && !isWeakPin)))

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
  const doSave = () => { if (!canSave || isPending) return; setError(null); if (isNew) createMutation.mutate(); else updateMutation.mutate() }

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
          {ROLES.filter((r) => isOwner || r !== "manager").map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ padding: "12px 14px", textAlign: "left", border: "1.5px solid " + (role === r ? "var(--color-ink)" : "var(--color-line)"), background: role === r ? "var(--color-surface-2)" : "var(--color-surface)", borderRadius: 10, cursor: "pointer", fontSize: 13, display: "flex", flexDirection: "column", gap: 4, fontFamily: "inherit", transition: "all .1s" }}>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{r}</span>
              <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{ROLE_DESCRIPTION[r]}</span>
            </button>
          ))}
        </div>
      </div>
      {field(isNew ? "4-digit PIN" : "Reset PIN",
        <input type="text" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "")); setError(null) }} placeholder="••••"
          style={inputStyle({ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: ".4em", textAlign: "center", borderColor: isWeakPin ? "var(--color-amber)" : undefined })}
          onFocus={(e) => { if (e.currentTarget.value === "••••") setPin(""); e.currentTarget.style.borderColor = isWeakPin ? "var(--color-amber)" : "var(--color-ink-3)"; }}
          onBlur={(e) => (e.currentTarget.style.borderColor = isWeakPin ? "var(--color-amber)" : "var(--color-line-strong)")} />
      )}
      {isWeakPin && <div style={{ fontSize: 12, color: "var(--color-amber)", marginTop: -10 }}>PIN is too common — choose something less predictable</div>}
      {!isNew && !isWeakPin && <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Leave PIN empty to keep current</span>}
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
        <ResponsiveListHeader columns="1fr 120px 100px 120px 100px">
          <span>Name</span><span>Role</span><span>PIN</span><span>Status</span><span style={{ textAlign: "right" }}>Actions</span>
        </ResponsiveListHeader>
        {staff.map((s) => {
          const avatar = <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{initials(s.name)}</div>
          const actions = (
            <>
              <ActionBtn onClick={() => setEditing({ id: s.id, name: s.name, role: s.role, pin: "••••", isActive: s.isActive })} title="Edit" />
              <button onClick={() => s.isActive ? disableMutation.mutate(s.id) : enableMutation.mutate(s.id)} title={s.isActive ? "Disable" : "Enable"} style={{ width: 32, height: 32, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = s.isActive ? "var(--color-red-soft)" : "var(--color-green-soft)"; (e.currentTarget as HTMLButtonElement).style.color = s.isActive ? "var(--color-red)" : "var(--color-green)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
                {s.isActive
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>}
              </button>
            </>
          )
          return (
            <ResponsiveListRow
              key={s.id}
              columns="1fr 120px 100px 120px 100px"
              opacity={s.isActive ? 1 : .5}
              card={
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {avatar}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <RoleBadge role={s.role} />
                      {s.isActive ? <span className="badge green"><span className="dot green" /> Active</span> : <span className="badge"><span className="dot gray" /> Disabled</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>{actions}</div>
                </div>
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {avatar}
                <div><div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div><div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 1 }}>{s.isActive ? "Active" : "Disabled"}</div></div>
              </div>
              <span><RoleBadge role={s.role} /></span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>••••</span>
              <span>{s.isActive ? <span className="badge green"><span className="dot green" /> Active</span> : <span className="badge"><span className="dot gray" /> Disabled</span>}</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>{actions}</div>
            </ResponsiveListRow>
          )
        })}
      </div>
      {editing && <StaffEditPanel record={editing} onClose={() => setEditing(null)} onSaved={() => {}} />}
    </>
  )
}

// ── Menu tab ─────────────────────────────────────────────────────────────────
function ItemEditPanel({ item, categories, taxConfigs, schedules, stations, variants, allModifierGroups, itemModifierGroupLinks, onClose, onSaved }: {
  item: EditItem; categories: Category[]; taxConfigs: TaxConfig[]; schedules: MenuSchedule[]; stations: Station[]
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
  const [scheduleId, setScheduleId] = useState(item.scheduleId ?? "")
  const [stationId, setStationId] = useState(item.stationId ?? "")
  const [newVarName, setNewVarName] = useState("")
  const [newVarPrice, setNewVarPrice] = useState("")
  const [generatingDesc, setGeneratingDesc] = useState(false)

  const linkedGroupIds = new Set(itemModifierGroupLinks.filter((l) => l.itemId === item.id).map((l) => l.groupId))

  async function generateDescription() {
    if (!name.trim() || generatingDesc) return
    setGeneratingDesc(true)
    try {
      const cat = categories.find((c) => c.id === catId)?.name ?? ""
      const { description } = await api.ai.menuDescription({ name: name.trim(), category: cat, dietaryType: isVeg ? "veg" : "non-veg" })
      setDesc(description)
    } catch {
      // silently ignore — user can retry
    } finally {
      setGeneratingDesc(false)
    }
  }

  const hsnError = hsnCode.length > 0 && hsnCode.length !== 6 && hsnCode.length !== 8
  const canSave = name.trim() && name.trim().length <= 100 && parseFloat(price) >= 0 && parseFloat(price) <= 1_000_000 && catId && !hsnError

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["menu"] }); onSaved() }

  const itemPayload = () => ({ name, basePrice: parseFloat(price), categoryId: catId, isVeg, description: desc || undefined, hsnCode: hsnCode.trim() || undefined, taxConfigId: taxConfigId || null, scheduleId: scheduleId || null, stationId: stationId || null })
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
  const doSave = () => { if (!canSave || isPending) return; if (isNew) createMutation.mutate(); else updateMutation.mutate() }

  return (
    <SlidePanel title={isNew ? "Add item" : `Edit "${item.name}"`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={doSave} disabled={!canSave || isPending} label={isPending ? "Saving…" : isNew ? "Add item" : "Save"} /></>}>
      <form onSubmit={(e) => { e.preventDefault(); doSave() }} style={{ display: "contents" }}>
        {field("Item name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Butter Chicken" maxLength={100} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("Base price (₹)", <input type="number" min="0" max={1_000_000} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
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
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)" }}>Description (optional)</span>
            <button type="button" onClick={generateDescription} disabled={!name.trim() || generatingDesc} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: generatingDesc ? "var(--color-ink-3)" : "var(--color-ink)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: !name.trim() || generatingDesc ? "not-allowed" : "pointer", opacity: !name.trim() ? 0.4 : 1 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
              {generatingDesc ? "Generating…" : "Generate"}
            </button>
          </div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description…" style={{ ...inputStyle({ height: 72, padding: "10px 14px", resize: "none" }), lineHeight: 1.5 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)" }}>HSN code (optional)</span>
            <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="e.g. 1902" style={inputStyle({ fontFamily: "var(--font-mono)", borderColor: hsnError ? "var(--color-red)" : undefined })} onFocus={(e) => (e.currentTarget.style.borderColor = hsnError ? "var(--color-red)" : "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = hsnError ? "var(--color-red)" : "var(--color-line-strong)")} />
            {hsnError && <span style={{ fontSize: 11, color: "var(--color-red)", marginTop: -2 }}>HSN must be exactly 6 or 8 digits</span>}
          </label>
          {taxConfigs.length > 0 && field("Tax config", (
            <select value={taxConfigId} onChange={(e) => setTaxConfigId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="">No tax</option>
              {taxConfigs.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.cgstRate}% + {t.sgstRate}%)</option>)}
            </select>
          ))}
        </div>
        {schedules.length > 0 && field("Availability schedule (optional)", (
          <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
            <option value="">Always available (or category schedule)</option>
            {schedules.filter((s) => s.isActive).map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime}{Number(s.percentOff) > 0 ? `, ${Number(s.percentOff)}% off` : ""})</option>
            ))}
          </select>
        ))}
        {stations.length > 0 && field("Kitchen station (optional)", (
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} style={{ ...inputStyle(), appearance: "none" }}>
            <option value="">Inherit from category</option>
            {stations.filter((s) => s.isActive).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        ))}
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
              <input value={newVarName} onChange={(e) => setNewVarName(e.target.value)} placeholder="Variant name (e.g. Large)" maxLength={100} style={{ ...inputStyle({ height: 36 }), flex: 1 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
              <input type="number" min="0" max={1_000_000} step="0.5" value={newVarPrice} onChange={(e) => setNewVarPrice(e.target.value)} placeholder="₹0" style={{ ...inputStyle({ height: 36, fontFamily: "var(--font-mono)", width: 80 }) }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
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
  const [showImport, setShowImport] = useState(false)

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: Category[]; items: MenuItemRow[]; variants: ItemVariant[]; modifierGroups: ModifierGroup[]; itemModifierGroups: ItemModifierGroupLink[]; taxConfigs: TaxConfig[]; schedules: MenuSchedule[]; stations: Station[] }> })
  const cats = menu?.categories ?? []
  const items = menu?.items ?? []
  const allModifierGroups = menu?.modifierGroups ?? []
  const itemModifierGroupLinks = menu?.itemModifierGroups ?? []
  const taxConfigs = (menu?.taxConfigs ?? []) as TaxConfig[]
  const schedules = menu?.schedules ?? []
  const stations = menu?.stations ?? []
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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import from image/PDF
          </button>
          <button onClick={() => setEditingItem({ _new: true, categoryId: activeCat ?? "", name: "", basePrice: "0", isVeg: true, description: "", hsnCode: "", taxConfigId: null })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add item
          </button>
        </div>
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
          {cats.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, color: "var(--color-ink-3)", padding: 24, textAlign: "center" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>
              <div style={{ fontSize: 15, color: "var(--color-ink-2)" }}>Your menu is empty</div>
              <div style={{ fontSize: 12, maxWidth: 280 }}>Already have a printed or PDF menu? Import it instead of typing everything by hand.</div>
              <button onClick={() => setShowImport(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import from image/PDF
              </button>
              <button onClick={() => setAddingCat(true)} style={{ fontSize: 12, color: "var(--color-ink-3)", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>or add a category manually</button>
            </div>
          ) : visibleItems.length === 0 ? (
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
                    <ActionBtn onClick={() => setEditingItem({ id: item.id, categoryId: item.categoryId, name: item.name, basePrice: item.basePrice, isVeg: item.isVeg, description: item.description ?? "", hsnCode: item.hsnCode ?? "", taxConfigId: item.taxConfigId ?? null, scheduleId: item.scheduleId ?? null, stationId: item.stationId ?? null })} title="Edit" />
                    <ActionBtn onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMutation.mutate(item.id) }} title="Delete" danger />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {editingItem && <ItemEditPanel item={editingItem} categories={cats} taxConfigs={taxConfigs} schedules={schedules} stations={stations} variants={(menu?.variants ?? []).filter((v) => v.itemId === editingItem.id)} allModifierGroups={allModifierGroups} itemModifierGroupLinks={itemModifierGroupLinks} onClose={() => setEditingItem(null)} onSaved={invalidate} />}
      {showImport && <MenuImportModal onClose={() => setShowImport(false)} onImported={invalidate} />}
    </>
  )
}

// ── Menu import (image/PDF → Gemini extraction) ──────────────────────────────
type ImportStep = "upload" | "extracting" | "review" | "committing"

// Real progress isn't observable mid-request (one Gemini call, one response) —
// this eases toward ~92% and cycles status text so the wait reads as active
// work rather than a frozen screen, then snaps to 100% the instant it resolves.
const EXTRACT_MESSAGES = [
  "Uploading file…",
  "Scanning the page layout…",
  "Reading item names & prices…",
  "Detecting veg / non-veg…",
  "Grouping into categories…",
]

function useExtractProgress(active: boolean) {
  const [progress, setProgress] = useState(0)
  const [messageIdx, setMessageIdx] = useState(0)

  useEffect(() => {
    if (!active) { setProgress(0); setMessageIdx(0); return }
    const progressTimer = setInterval(() => setProgress((p) => (p >= 92 ? p : p + (92 - p) * 0.12)), 300)
    const messageTimer = setInterval(() => setMessageIdx((i) => (i + 1) % EXTRACT_MESSAGES.length), 1900)
    return () => { clearInterval(progressTimer); clearInterval(messageTimer) }
  }, [active])

  return { progress, message: EXTRACT_MESSAGES[messageIdx]! }
}

function ExtractingView({ progress, message }: { progress: number; message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "56px 24px", textAlign: "center" }}>
      <div style={{ position: "relative", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="animate-spin" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid var(--color-line)", borderTopColor: "var(--v2-marigold)" }} />
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--v2-marigold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>Reading your menu with AI</div>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 6, minHeight: 18 }}>{message}</div>
      </div>
      <div style={{ width: "100%", maxWidth: 280, height: 6, borderRadius: 3, background: "var(--color-surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "var(--v2-marigold)", borderRadius: 3, transition: "width .5s ease" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-4)" }}>This can take up to 20 seconds for multi-page menus</div>
    </div>
  )
}

function MenuImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<ImportStep>("upload")
  const [error, setError] = useState("")
  const [menu, setMenu] = useState<ExtractedMenu | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { progress: extractProgress, message: extractMessage } = useExtractProgress(step === "extracting")

  const extractMutation = useMutation({
    mutationFn: (file: File) => api.menu.importExtract(file),
    onMutate: () => { setStep("extracting"); setError("") },
    onSuccess: (data) => { setMenu(data); setStep("review") },
    onError: (e: unknown) => { setError(e instanceof ApiError ? e.message : "Extraction failed — please try again"); setStep("upload") },
  })

  const commitMutation = useMutation({
    mutationFn: () => api.menu.importCommit({
      categories: (menu?.categories ?? []).filter((c) => c.items.length > 0),
      modifierGroups: (menu?.modifierGroups ?? []).filter((g) => g.options.length > 0),
    }),
    onMutate: () => { setStep("committing"); setError("") },
    onSuccess: () => { onImported(); onClose() },
    onError: (e: unknown) => { setError(e instanceof ApiError ? e.message : "Import failed — please try again"); setStep("review") },
  })

  function handleFile(file: File) {
    setError("")
    if (file.size > 15 * 1024 * 1024) { setError("File too large (max 15MB)"); return }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { setError("Upload a JPEG, PNG, WebP, or PDF"); return }
    extractMutation.mutate(file)
  }

  function updateItem(catIdx: number, itemIdx: number, patch: Partial<ExtractedItem>) {
    setMenu((m) => m && { ...m, categories: m.categories.map((c, ci) => (ci !== catIdx ? c : { ...c, items: c.items.map((it, ii) => (ii !== itemIdx ? it : { ...it, ...patch })) })) })
  }
  function deleteItem(catIdx: number, itemIdx: number) {
    setMenu((m) => m && { ...m, categories: m.categories.map((c, ci) => (ci !== catIdx ? c : { ...c, items: c.items.filter((_, ii) => ii !== itemIdx) })) })
  }
  function updateCategoryName(catIdx: number, name: string) {
    setMenu((m) => m && { ...m, categories: m.categories.map((c, ci) => (ci !== catIdx ? c : { ...c, name })) })
  }
  function deleteCategory(catIdx: number) {
    setMenu((m) => m && { ...m, categories: m.categories.filter((_, ci) => ci !== catIdx) })
  }
  function deleteVariant(catIdx: number, itemIdx: number, vIdx: number) {
    const item = menu?.categories[catIdx]?.items[itemIdx]
    if (!item) return
    updateItem(catIdx, itemIdx, { variants: item.variants.filter((_, vi) => vi !== vIdx) })
  }

  function updateModifierGroup(gIdx: number, patch: Partial<ExtractedModifierGroup>) {
    setMenu((m) => m && { ...m, modifierGroups: m.modifierGroups.map((g, gi) => (gi !== gIdx ? g : { ...g, ...patch })) })
  }
  function deleteModifierGroup(gIdx: number) {
    setMenu((m) => m && { ...m, modifierGroups: m.modifierGroups.filter((_, gi) => gi !== gIdx) })
  }
  function deleteModifierOption(gIdx: number, oIdx: number) {
    const group = menu?.modifierGroups[gIdx]
    if (!group) return
    updateModifierGroup(gIdx, { options: group.options.filter((_, oi) => oi !== oIdx) })
  }

  const totalItems = menu?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0
  const totalModifierGroups = menu?.modifierGroups.length ?? 0
  const isBusy = step === "extracting" || step === "committing"
  const hasNothingToPush = totalItems === 0 && totalModifierGroups === 0

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={isBusy ? undefined : onClose}>
      <div style={{ background: "var(--color-surface)", borderRadius: 20, width: "min(720px, 92vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Import menu</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>
              {step === "upload" && "Upload a photo or PDF of your existing menu"}
              {step === "extracting" && "Reading your menu…"}
              {step === "review" && `Review ${totalItems} item${totalItems !== 1 ? "s" : ""} across ${menu?.categories.length ?? 0} categories${totalModifierGroups > 0 ? ` and ${totalModifierGroups} add-on group${totalModifierGroups !== 1 ? "s" : ""}` : ""} before pushing`}
              {step === "committing" && "Adding to your menu…"}
            </div>
          </div>
          <button onClick={onClose} disabled={isBusy} style={{ background: "transparent", border: "none", color: "var(--color-ink-3)", cursor: isBusy ? "default" : "pointer", padding: 6, borderRadius: 8, display: "flex", opacity: isBusy ? .3 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="scroll" style={{ flex: 1, padding: 24, overflow: "auto" }}>
          {step === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              style={{ border: "2px dashed var(--color-line-strong)", borderRadius: 16, padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div style={{ fontSize: 14, color: "var(--color-ink-2)" }}>Drag a menu photo or PDF here, or</div>
              <button onClick={() => fileInputRef.current?.click()} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                Choose file
              </button>
              <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>JPEG, PNG, WebP, or PDF · up to 15MB</div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}
          {step === "extracting" && <ExtractingView progress={extractProgress} message={extractMessage} />}
          {error && <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-red)", background: "var(--color-red-soft)", borderRadius: 10, padding: "10px 14px" }}>{error}</div>}

          {(step === "review" || step === "committing") && menu && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: step === "committing" ? .5 : 1, pointerEvents: step === "committing" ? "none" : "auto" }}>
              {menu.categories.map((cat, ci) => (
                <div key={ci} style={{ border: "1px solid var(--color-line)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "var(--color-surface-2)", display: "flex", alignItems: "center", gap: 8 }}>
                    <input value={cat.name} onChange={(e) => updateCategoryName(ci, e.target.value)} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--color-ink)", fontFamily: "inherit" }} />
                    <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{cat.items.length} items</span>
                    <ActionBtn onClick={() => deleteCategory(ci)} title="Delete" danger />
                  </div>
                  <div>
                    {cat.items.map((item, ii) => (
                      <div key={ii} style={{ padding: "12px 14px", borderTop: "1px solid var(--color-line)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button onClick={() => updateItem(ci, ii, { isVeg: !item.isVeg })} title="Toggle veg/non-veg" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}>
                            <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} style={{ width: 10, height: 10 }} />
                          </button>
                          <input value={item.name} onChange={(e) => updateItem(ci, ii, { name: e.target.value })} style={{ flex: 1, height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                          <input type="number" min="0" step="1" value={item.price} onChange={(e) => updateItem(ci, ii, { price: Number(e.target.value) || 0 })} style={{ width: 90, height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }} />
                          <ActionBtn onClick={() => deleteItem(ci, ii)} title="Delete" danger />
                        </div>
                        <input value={item.description ?? ""} onChange={(e) => updateItem(ci, ii, { description: e.target.value || null })} placeholder="Description (optional)" style={{ height: 30, padding: "0 10px", border: "1px solid var(--color-line)", borderRadius: 8, background: "transparent", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                        {item.variants.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {item.variants.map((v, vi) => (
                              <div key={vi} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--color-surface-2)", borderRadius: 8, padding: "4px 8px" }}>
                                <input value={v.name} onChange={(e) => updateItem(ci, ii, { variants: item.variants.map((vv, k) => (k === vi ? { ...vv, name: e.target.value } : vv)) })} style={{ width: 70, background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--color-ink-2)", fontFamily: "inherit" }} />
                                <input type="number" min="0" value={v.price} onChange={(e) => updateItem(ci, ii, { variants: item.variants.map((vv, k) => (k === vi ? { ...vv, price: Number(e.target.value) || 0 } : vv)) })} style={{ width: 56, background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--color-ink-2)", fontFamily: "var(--font-mono)", textAlign: "right" }} />
                                <button onClick={() => deleteVariant(ci, ii, vi)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", padding: 0, display: "flex" }}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {cat.items.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-ink-3)" }}>No items left in this category — it will be skipped.</div>}
                  </div>
                </div>
              ))}

              {menu.modifierGroups.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--color-ink-3)", marginBottom: 8 }}>Add-on groups</div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 12 }}>Priced extras like flavour shots or toppings — not linked to any item yet. Attach each group to the items it applies to from that item's Edit panel after importing.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {menu.modifierGroups.map((group, gi) => (
                      <div key={gi} style={{ border: "1px solid var(--color-line)", borderRadius: 14, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px", background: "var(--color-surface-2)", display: "flex", alignItems: "center", gap: 8 }}>
                          <input value={group.name} onChange={(e) => updateModifierGroup(gi, { name: e.target.value })} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--color-ink)", fontFamily: "inherit" }} />
                          <span style={{ fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{group.options.length} options</span>
                          <ActionBtn onClick={() => deleteModifierGroup(gi)} title="Delete" danger />
                        </div>
                        <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {group.options.map((opt, oi) => (
                            <div key={oi} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--color-surface-2)", borderRadius: 8, padding: "4px 8px" }}>
                              <input value={opt.name} onChange={(e) => updateModifierGroup(gi, { options: group.options.map((o, k) => (k === oi ? { ...o, name: e.target.value } : o)) })} style={{ width: 90, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--color-ink-2)", fontFamily: "inherit" }} />
                              <input type="number" min="0" value={opt.price} onChange={(e) => updateModifierGroup(gi, { options: group.options.map((o, k) => (k === oi ? { ...o, price: Number(e.target.value) || 0 } : o)) })} style={{ width: 56, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--color-ink-2)", fontFamily: "var(--font-mono)", textAlign: "right" }} />
                              <button onClick={() => deleteModifierOption(gi, oi)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", padding: 0, display: "flex" }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                          {group.options.length === 0 && <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>No options left — this group will be skipped.</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: 18, borderTop: "1px solid var(--color-line)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <CancelBtn onClose={onClose} />
          {step === "review" && <SaveBtn onClick={() => commitMutation.mutate()} disabled={hasNothingToPush} label={`Push to menu${totalItems > 0 ? ` (${totalItems} item${totalItems !== 1 ? "s" : ""})` : ""}${totalModifierGroups > 0 ? ` + ${totalModifierGroups} add-on group${totalModifierGroups !== 1 ? "s" : ""}` : ""}`} />}
          {step === "committing" && <SaveBtn disabled label="Adding…" />}
        </div>
      </div>
    </div>
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
  const doSave = () => { if (!canSave || isPending) return; if (isNew) createMutation.mutate(); else updateMutation.mutate() }
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
  const outletId = useAuthStore((s) => s.outletId)
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)
  const [editingTable, setEditingTable] = useState<EditTable | null>(null)
  const [qrTable, setQrTable] = useState<{ id: string; name: string } | null>(null)
  const { data: lanData } = useQuery({ queryKey: ["lan-url"], queryFn: () => api.public.lanUrl(), enabled: !!qrTable, staleTime: 30_000 })
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
                  <ActionBtn onClick={() => setQrTable({ id: t.id, name: t.name })} title="QR" />
                  <ActionBtn onClick={() => { if (t.status !== "available") { alert("Cannot delete a table with an active order"); return; } if (confirm(`Delete table "${t.name}"?`)) deleteTableMutation.mutate(t.id) }} title="Delete" danger />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {editingTable && <TableEditPanel table={editingTable} floors={floors} onClose={() => setEditingTable(null)} onSaved={invalidate} />}

      {qrTable && outletId && (() => {
        const lanUrls = lanData?.urls ?? []
        const baseUrl = lanUrls[0] ?? window.location.origin
        const qrUrl = `${baseUrl}/menu/${outletId}/${qrTable.id}`
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setQrTable(null)}>
            <div style={{ background: "var(--color-surface)", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, boxShadow: "var(--shadow-3)", minWidth: 300 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>QR — {qrTable.name}</div>
              {isLocalhost && lanUrls.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--color-amber)", background: "rgba(245,158,11,.1)", borderRadius: 8, padding: "8px 12px", textAlign: "center", maxWidth: 240 }}>
                  Server not reachable from other devices. Open the POS via your machine's IP address to generate a working QR.
                </div>
              )}
              <div style={{ background: "#fff", padding: 14, borderRadius: 12 }}>
                <QRCode value={qrUrl} size={200} />
              </div>
              {lanUrls.length > 1 && (
                <select
                  defaultValue={lanUrls[0]}
                  onChange={() => {/* re-renders via lanUrls[0] — for multi-NIC, user sees dropdown */}}
                  style={{ width: "100%", height: 36, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 12, padding: "0 8px", fontFamily: "var(--font-mono)" }}
                >
                  {lanUrls.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
              <div style={{ fontSize: 11, color: "var(--color-ink-3)", textAlign: "center", maxWidth: 260, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>
                {qrUrl}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => window.print()} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: "var(--color-ink-2)" }}>Print</button>
                <button onClick={() => setQrTable(null)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: "var(--color-bg)", fontWeight: 600 }}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

// ── Tax & Charges tab ────────────────────────────────────────────────────────
function TaxTab() {
  const qc = useQueryClient()
  const isOwner = useAuthStore((s) => s.user?.role === "owner")
  const [cgst, setCgst] = useState("")
  const [sgst, setSgst] = useState("")
  const [igst, setIgst] = useState("")
  const [name, setName] = useState("Default")
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingCharge, setEditingCharge] = useState<Partial<ChargeRow> & { _new?: boolean } | null>(null)
  const [chargeErr, setChargeErr] = useState("")

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

  const { data: chargeRows = [] } = useQuery({ queryKey: ["charges"], queryFn: () => api.charges.list() as Promise<ChargeRow[]> })
  const invalidateCharges = () => { qc.invalidateQueries({ queryKey: ["charges"] }); setEditingCharge(null); setChargeErr("") }
  const createChargeMutation = useMutation({ mutationFn: (d: object) => api.charges.create(d), onSuccess: invalidateCharges, onError: (e: Error) => setChargeErr(e.message) })
  const updateChargeMutation = useMutation({ mutationFn: ({ id, ...d }: { id: string } & object) => api.charges.update(id, d), onSuccess: invalidateCharges, onError: (e: Error) => setChargeErr(e.message) })
  const deleteChargeMutation = useMutation({ mutationFn: (id: string) => api.charges.delete(id), onSuccess: invalidateCharges, onError: (e: Error) => setChargeErr(e.message) })
  const toggleChargeMutation = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.charges.update(id, { isActive }), onSuccess: invalidateCharges })

  function handleSaveCharge() {
    if (!editingCharge) return
    const { _new, id, ...rest } = editingCharge
    if (!rest.name?.trim() || !rest.value) { setChargeErr("Name and value are required"); return }
    if (rest.name.trim().length > 100) { setChargeErr("Name must be 100 characters or less"); return }
    const numVal = parseFloat(String(rest.value))
    if (isNaN(numVal) || numVal <= 0) { setChargeErr("Value must be a positive number"); return }
    if ((rest.type ?? "percentage") === "percentage" && numVal > 100) { setChargeErr("Percentage charge cannot exceed 100%"); return }
    if ((rest.type ?? "percentage") === "flat" && numVal > 1_000_000) { setChargeErr("Flat charge cannot exceed ₹10,00,000"); return }
    const payload = { name: rest.name.trim(), type: rest.type ?? "percentage", value: numVal, isActive: rest.isActive ?? true }
    if (_new) createChargeMutation.mutate(payload)
    else updateChargeMutation.mutate({ id: id!, ...payload })
  }
  const chargeSaving = createChargeMutation.isPending || updateChargeMutation.isPending

  const subtotalExample = 1000
  const cgstAmt = subtotalExample * (parseFloat(cgst || "0") / 100)
  const sgstAmt = subtotalExample * (parseFloat(sgst || "0") / 100)
  const activeCharges = chargeRows.filter((c) => c.isActive)
  const chargeAmts = activeCharges.map((c) => ({ row: c, amt: c.type === "percentage" ? subtotalExample * (Number(c.value) / 100) : Number(c.value) }))
  const chargeAmtTotal = chargeAmts.reduce((s, c) => s + c.amt, 0)
  const totalAmt = subtotalExample + cgstAmt + sgstAmt + chargeAmtTotal

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tax & Charges</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Applied to all orders at billing time</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "28px 32px" }}>
        {!isOwner ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--color-ink-3)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-2)" }}>Owner access required</div>
            <div style={{ fontSize: 13, textAlign: "center" }}>Tax rates can only be changed by the outlet owner.</div>
            {config && (
              <div style={{ marginTop: 8, padding: "14px 24px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px solid var(--color-line)", fontSize: 13, color: "var(--color-ink-2)", display: "flex", gap: 24 }}>
                <span>CGST: {config.cgstRate}%</span>
                <span>SGST: {config.sgstRate}%</span>
                <span>IGST: {config.igstRate}%</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
            {field("Config name", <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {field("CGST %", <input type="number" min="0" max="50" step="0.5" value={cgst} onChange={(e) => setCgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
              {field("SGST %", <input type="number" min="0" max="50" step="0.5" value={sgst} onChange={(e) => setSgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
              {field("IGST %", <input type="number" min="0" max="50" step="0.5" value={igst} onChange={(e) => setIgst(e.target.value)} placeholder="0" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>

            <div style={{ padding: 18, background: "var(--color-surface-2)", borderRadius: 12, border: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase", fontWeight: 500, marginBottom: 12 }}>Preview on ₹1,000 order</div>
              {[["Subtotal", formatCurrency(subtotalExample)], ...(cgstAmt > 0 ? [[`CGST (${cgst}%)`, formatCurrency(cgstAmt)]] : []), ...(sgstAmt > 0 ? [[`SGST (${sgst}%)`, formatCurrency(sgstAmt)]] : []), ...chargeAmts.map((c) => [c.row.type === "percentage" ? `${c.row.name} (${c.row.value}%)` : c.row.name, formatCurrency(c.amt)])].map(([label, val]) => (
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

            <div style={{ height: 1, background: "var(--color-line)", margin: "8px 0" }} />

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Charges</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>Service charge, packaging charge, etc. — not taxable, added after GST, waivable per bill</div>
              </div>
              <button onClick={() => { setEditingCharge({ _new: true, type: "percentage", value: "", isActive: true }); setChargeErr("") }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>New charge
              </button>
            </div>

            {chargeRows.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-ink-3)" }}>No charges configured</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {chargeRows.map((row) => (
                  <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, opacity: row.isActive ? 1 : .5 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>{row.type === "percentage" ? `${row.value}%` : formatCurrency(row.value)}</div>
                    </div>
                    <button onClick={() => toggleChargeMutation.mutate({ id: row.id, isActive: !row.isActive })} style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid " + (row.isActive ? "var(--color-green)" : "var(--color-line)"), background: row.isActive ? "var(--color-green-soft)" : "var(--color-surface-2)", color: row.isActive ? "var(--color-green)" : "var(--color-ink-3)", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                      {row.isActive ? "Active" : "Off"}
                    </button>
                    <ActionBtn onClick={() => { setEditingCharge({ ...row }); setChargeErr("") }} title="Edit" />
                    <ActionBtn onClick={() => { if (confirm(`Delete "${row.name}"?`)) deleteChargeMutation.mutate(row.id) }} title="Delete" danger />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editingCharge && (
        <SlidePanel title={editingCharge._new ? "New charge" : `Edit "${editingCharge.name}"`} onClose={() => setEditingCharge(null)}
          footer={<><CancelBtn onClose={() => setEditingCharge(null)} /><SaveBtn onClick={handleSaveCharge} disabled={chargeSaving} label={chargeSaving ? "Saving…" : editingCharge._new ? "Create" : "Save"} /></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {chargeErr && <div style={{ padding: "10px 14px", background: "var(--color-red-soft)", color: "var(--color-red)", borderRadius: 8, fontSize: 13 }}>{chargeErr}</div>}
            {field("Charge name", <input value={editingCharge.name ?? ""} onChange={(e) => setEditingCharge((d) => ({ ...d!, name: e.target.value }))} placeholder="e.g. Service Charge, Packaging Charge" maxLength={100} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Type", (
                <select value={editingCharge.type ?? "percentage"} onChange={(e) => setEditingCharge((d) => ({ ...d!, type: e.target.value as "percentage" | "flat" }))} style={{ ...inputStyle(), appearance: "none" }}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat amount (₹)</option>
                </select>
              ))}
              {field(editingCharge.type === "flat" ? "Amount (₹)" : "Percentage (%)", <input type="number" min="0" max={editingCharge.type === "flat" ? 1_000_000 : 100} step="0.01" value={editingCharge.value ?? ""} onChange={(e) => setEditingCharge((d) => ({ ...d!, value: e.target.value }))} placeholder={editingCharge.type === "flat" ? "e.g. 20" : "e.g. 10"} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
          </div>
        </SlidePanel>
      )}
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
type VoidReport    = { id: string; orderId: string; itemName: string; qty: number; unitPrice: string; staffName: string; createdAt: string }
type StaffReport   = { staffId: string; name: string; billCount: number; revenue: number }

function ShiftsTab() {
  const today = new Date().toISOString().split("T")[0]!
  const [from, setFrom]   = useState(today)
  const [to, setTo]       = useState(today)
  const [preset, setPreset] = useState(0)
  const [subTab, setSubTab] = useState<"summary" | "items" | "categories" | "hourly" | "food-cost" | "voids" | "staff">("summary")
  const [aiQuestion, setAiQuestion] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<{ q: string; a: string }[]>([])

  async function askAi() {
    const q = aiQuestion.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAiQuestion("")
    try {
      const { answer } = await api.ai.reportsQuery({ question: q, from, to })
      setAiHistory((prev) => [...prev.slice(-2), { q, a: answer }])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get answer"
      setAiHistory((prev) => [...prev.slice(-2), { q, a: `Error: ${msg}` }])
    } finally {
      setAiLoading(false)
    }
  }

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

  const { data: voidsData, isLoading: voidsLoading } = useQuery({
    queryKey: ["report.voids", from, to],
    queryFn: () => api.reports.voids(from, to) as Promise<VoidReport[]>,
    enabled: subTab === "voids",
  })

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ["report.staff", from, to],
    queryFn: () => api.reports.staffPerformance(from, to) as Promise<StaffReport[]>,
    enabled: subTab === "staff",
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
          <button onClick={() => void api.reports.exportGstr1(from, to)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            GST Export
          </button>
          <button onClick={() => void api.reports.exportBillsCsv(from, to)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
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
          {(["summary", "items", "categories", "hourly", "food-cost", "voids", "staff"] as const).map((t) => (
            <button key={t} onClick={() => setSubTab(t)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: subTab === t ? "var(--color-surface)" : "transparent", boxShadow: subTab === t ? "var(--shadow-1)" : "none", fontSize: 13, fontWeight: subTab === t ? 600 : 400, color: subTab === t ? "var(--color-ink)" : "var(--color-ink-3)", cursor: "pointer", fontFamily: "inherit", transition: "all .1s", textTransform: "capitalize" }}>
              {t === "food-cost" ? "Food Cost" : t === "voids" ? "Void Log" : t === "staff" ? "Staff" : t}
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

        {/* Void Log */}
        {subTab === "voids" && (voidsLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : (
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px 120px 140px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              <span>Item</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "center" }}>Staff</span><span style={{ textAlign: "right" }}>Time</span>
            </div>
            {!voidsData || voidsData.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-ink-3)", fontSize: 14 }}>No voided items in this period</div>
            ) : voidsData.map((row, i) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px 90px 120px 140px", padding: "11px 16px", borderBottom: i < voidsData.length - 1 ? "1px solid var(--color-line)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{row.itemName}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-red)" }}>{row.qty}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{formatCurrency(row.unitPrice)}</span>
                <span style={{ textAlign: "center", fontSize: 12, color: "var(--color-ink-3)" }}>{row.staffName}</span>
                <span style={{ textAlign: "right", fontSize: 11, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{new Date(row.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Staff Performance */}
        {subTab === "staff" && (staffLoading ? <div style={{ color: "var(--color-ink-3)", fontSize: 14 }}>Loading…</div> : (
          <>
            {!staffData || staffData.length === 0 ? (
              <div style={{ color: "var(--color-ink-3)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>No billing data in this period. Staff attribution requires bills created after this update.</div>
            ) : (
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "10px 16px", borderBottom: "1px solid var(--color-line)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  <span>Staff</span><span style={{ textAlign: "right" }}>Bills</span><span style={{ textAlign: "right" }}>Revenue</span>
                </div>
                {staffData.map((row, i) => (
                  <div key={row.staffId} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px", padding: "12px 16px", borderBottom: i < staffData.length - 1 ? "1px solid var(--color-line)" : "none", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{row.name}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>{row.billCount}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{formatCurrency(row.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}

        {/* AI query bar */}
        <div style={{ marginTop: 8, padding: "20px 24px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: aiHistory.length > 0 ? 16 : 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--color-ink-3)", flexShrink: 0 }}><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", letterSpacing: ".04em" }}>ASK YOUR DATA</span>
          </div>
          {aiHistory.map((item, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 6 }}>{item.q}</div>
              <div style={{ fontSize: 14, color: "var(--color-ink)", lineHeight: 1.6, padding: "12px 16px", background: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: 10 }}>{item.a}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void askAi() } }}
              placeholder="e.g. What was my best-selling day this week?"
              style={{ flex: 1, height: 44, padding: "0 14px", border: "1px solid var(--color-line-strong)", borderRadius: 10, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 14, outline: "none", fontFamily: "inherit" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")}
            />
            <button onClick={() => void askAi()} disabled={!aiQuestion.trim() || aiLoading} style={{ padding: "0 18px", height: 44, borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: !aiQuestion.trim() || aiLoading ? "not-allowed" : "pointer", opacity: !aiQuestion.trim() ? 0.4 : 1 }}>
              {aiLoading ? "…" : "Ask"}
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-ink-3)", textAlign: "right" }}>Powered by Claude · 20 queries/day</div>
        </div>
      </div>
    </>
  )
}

// ── Outlet settings tab ──────────────────────────────────────────────────────
function OutletTab() {
  const qc = useQueryClient()
  const isOwner = useAuthStore((s) => s.user?.role === "owner")
  const [name, setName]               = useState("")
  const [address, setAddress]         = useState("")
  const [phone, setPhone]             = useState("")
  const [gstin, setGstin]             = useState("")
  const [fssaiNumber, setFssaiNumber] = useState("")
  const [upiVpa, setUpiVpa]           = useState("")
  const [razorpayKeyId, setRazorpayKeyId]         = useState("")
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("")
  const [deliveryEnabled, setDeliveryEnabled] = useState(false)
  const [operationType, setOperationType] = useState<OperationType>("full_service")
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
    setFssaiNumber(outlet.fssaiNumber ?? "")
    setUpiVpa(outlet.upiVpa ?? "")
    setRazorpayKeyId(outlet.razorpayKeyId ?? "")
    setDeliveryEnabled(outlet.settings?.deliveryEnabled ?? false)
    setOperationType(operationTypeFromSettings(outlet.settings))
    setLoaded(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => api.outlet.update({
      name, address, phone,
      gstin: gstin || undefined,
      fssaiNumber: fssaiNumber || undefined,
      upiVpa: upiVpa || undefined,
      razorpayKeyId: razorpayKeyId || undefined,
      razorpayKeySecret: razorpayKeySecret || undefined,
      // PATCH /outlet replaces the whole settings object, so every known key
      // must be included here or it gets silently dropped.
      settings: { deliveryEnabled, ...operationTypeToSettings(operationType) },
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
        {!isOwner ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "var(--color-ink-3)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-2)" }}>Owner access required</div>
            <div style={{ fontSize: 13, textAlign: "center" }}>Outlet settings can only be changed by the outlet owner.</div>
            {outlet && (
              <div style={{ marginTop: 8, padding: "14px 24px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px solid var(--color-line)", fontSize: 13, color: "var(--color-ink-2)", display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                <span style={{ fontWeight: 600 }}>{outlet.name}</span>
                {outlet.address && <span style={{ color: "var(--color-ink-3)" }}>{outlet.address}</span>}
                {outlet.gstin && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>GSTIN: {outlet.gstin}</span>}
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
            {field("Outlet name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Spice Garden" maxLength={100} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("Address", <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state, PIN" maxLength={500} style={{ ...inputStyle({ height: 80, padding: "10px 14px", resize: "none" }), lineHeight: 1.5 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("Phone", <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} placeholder="e.g. 9876543210" style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("GSTIN (optional)", <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" style={inputStyle({ fontFamily: "var(--font-mono)", letterSpacing: ".05em" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            {field("FSSAI licence number (optional)", <input value={fssaiNumber} onChange={(e) => setFssaiNumber(e.target.value)} placeholder="e.g. 12345678901234" style={inputStyle({ fontFamily: "var(--font-mono)", letterSpacing: ".05em" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}

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

            <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginBottom: 4 }}>Operation type</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16 }}>Controls whether the floor page shows tables and whether orders go through kitchen ticketing</div>
              <OperationTypeCards value={operationType} onChange={setOperationType} />
            </div>

            <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)", marginBottom: 4 }}>Preferences</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16 }}>Configure how this outlet operates</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--color-surface-2)", borderRadius: 10, border: "1px solid var(--color-line)", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>Enable delivery orders</div>
                    <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>Shows a Delivery button on the floor page for in-house delivery tracking</div>
                  </div>
                  <div
                    onClick={() => setDeliveryEnabled((v) => !v)}
                    style={{ width: 44, height: 24, borderRadius: 12, background: deliveryEnabled ? "var(--color-green)" : "var(--color-line-strong)", position: "relative", flexShrink: 0, marginLeft: 16, cursor: "pointer", transition: "background .15s" }}
                  >
                    <div style={{ position: "absolute", top: 3, left: deliveryEnabled ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                  </div>
                </label>
              </div>
            </div>

            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} style={{ alignSelf: "flex-start", padding: "12px 24px", borderRadius: 10, border: "none", background: saved ? "var(--color-green)" : "var(--color-ink)", color: "var(--color-bg)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", transition: "background .2s", opacity: !name.trim() ? .4 : 1 }}>
              {saved ? "Saved!" : saveMutation.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
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
  const [applyCategoryId, setApplyCategoryId] = useState("")
  const [applyStatus, setApplyStatus] = useState("")

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: Category[]; modifierGroups: ModifierGroup[]; modifiers: Modifier[] }> })
  const cats = (menu?.categories ?? []).filter((c) => c.isActive)
  const groups = menu?.modifierGroups ?? []
  const allMods = menu?.modifiers ?? []
  const groupModifiers = allMods.filter((m) => m.groupId === selectedGroupId && m.isActive)
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] })

  const applyMutation = useMutation({
    mutationFn: () => api.menu.applyModifierGroupToCategory(selectedGroupId!, applyCategoryId),
    onSuccess: (result) => {
      invalidate()
      setApplyStatus(
        result.linked === 0
          ? `All ${result.totalItems} item${result.totalItems !== 1 ? "s" : ""} already had this group`
          : `Applied to ${result.linked} item${result.linked !== 1 ? "s" : ""}${result.alreadyLinked > 0 ? ` (${result.alreadyLinked} already had it)` : ""}`,
      )
    },
  })

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
            <div key={g.id} onClick={() => { setSelectedGroupId(g.id); setApplyCategoryId(""); setApplyStatus("") }}
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

              <div style={{ border: "1px solid var(--color-line)", borderRadius: 10, padding: "12px 14px", marginBottom: 20, background: "var(--color-surface-2)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-2)", marginBottom: 8 }}>Apply to a whole category</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={applyCategoryId} onChange={(e) => { setApplyCategoryId(e.target.value); setApplyStatus("") }} style={{ ...inputStyle({ height: 36 }), flex: 1, appearance: "none" }}>
                    <option value="">Select category…</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    onClick={() => applyMutation.mutate()}
                    disabled={!applyCategoryId || applyMutation.isPending}
                    style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !applyCategoryId || applyMutation.isPending ? .4 : 1, flexShrink: 0 }}
                  >
                    {applyMutation.isPending ? "Applying…" : "Apply"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 8 }}>
                  {applyStatus || "Links this group to every item currently in the category. Doesn't cover items added later — re-run to catch those up."}
                </div>
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
                <input type="number" min={-100_000} max={100_000} value={loyaltyDelta} onChange={(e) => setLoyaltyDelta(e.target.value)} placeholder="Points (positive = add, negative = redeem)" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
                <input value={loyaltyNote} onChange={(e) => setLoyaltyNote(e.target.value)} placeholder="Note (optional)" maxLength={200} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
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

  // ── Shift drawer: open → record entries → close with reconciliation ────────
  const [openingCash, setOpeningCash] = useState("")
  const [closingCash, setClosingCash] = useState("")
  const [showClose, setShowClose]     = useState(false)

  const { data: shiftSummary, isLoading: shiftLoading } = useQuery({
    queryKey: ["shift-summary"],
    queryFn: () => api.shifts.summary(),
    refetchInterval: 60_000,
  })

  const openShiftMutation = useMutation({
    mutationFn: () => api.shifts.open(parseFloat(openingCash) || 0),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shift-summary"] }); setOpeningCash("") },
    onError: (e: Error) => alert(e.message || "Could not open shift"),
  })
  const closeShiftMutation = useMutation({
    mutationFn: () => api.shifts.close(parseFloat(closingCash) || 0),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shift-summary"] }); setClosingCash(""); setShowClose(false) },
    onError: (e: Error) => alert(e.message || "Could not close shift"),
  })

  const expected = shiftSummary ? Number(shiftSummary.expectedCash) : 0
  const counted  = parseFloat(closingCash)
  const variance = Number.isFinite(counted) ? counted - expected : null

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cash-entries"] })
  const createMutation = useMutation({
    mutationFn: () => api.cashEntries.create({ type: entryType, amount: parseFloat(amount), note: note || undefined }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["shift-summary"] }); setAmount(""); setNote("") },
    onError: (e: Error) => alert(e.message || "Could not add entry"),
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
        {/* Shift drawer — open/close with expected-vs-counted reconciliation */}
        {!shiftLoading && (
          <div style={{ marginBottom: 20, padding: "16px 18px", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12 }}>
            {!shiftSummary ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>No shift open</div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>Open a shift with the drawer's starting cash to record expenses and reconcile at close</div>
                </div>
                <input type="number" min="0" step="0.5" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="₹ Opening cash" style={{ ...inputStyle({ height: 38, width: 140, fontFamily: "var(--font-mono)" }) }} />
                <button onClick={() => openShiftMutation.mutate()} disabled={openingCash === "" || openShiftMutation.isPending} style={{ height: 38, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--color-green)", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: openingCash === "" ? .5 : 1 }}>
                  {openShiftMutation.isPending ? "Opening…" : "Open shift"}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-green)", display: "inline-block" }} />
                      Shift open since {new Date(shiftSummary.shift.openedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>Opening float {formatCurrency(shiftSummary.shift.openingCash)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-ink-2)", flexWrap: "wrap" }}>
                    <span>Cash sales <b style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(shiftSummary.cashSales)}</b></span>
                    <span>Card <b style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(shiftSummary.cardSales)}</b></span>
                    <span>UPI <b style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(shiftSummary.upiSales)}</b></span>
                    <span>In <b style={{ fontFamily: "var(--font-mono)", color: "var(--color-green)" }}>{formatCurrency(shiftSummary.cashIn)}</b></span>
                    <span>Out <b style={{ fontFamily: "var(--font-mono)", color: "var(--color-red)" }}>{formatCurrency(shiftSummary.cashOut)}</b></span>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Expected in drawer</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700 }}>{formatCurrency(shiftSummary.expectedCash)}</div>
                  </div>
                  {!showClose && (
                    <button onClick={() => setShowClose(true)} style={{ height: 38, padding: "0 16px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-ink-2)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                      Close shift
                    </button>
                  )}
                </div>
                {showClose && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--color-line)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "var(--color-ink-2)" }}>Count the drawer:</span>
                    <input type="number" min="0" step="0.5" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="₹ Counted cash" autoFocus style={{ ...inputStyle({ height: 38, width: 150, fontFamily: "var(--font-mono)" }) }} />
                    {variance !== null && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: Math.abs(variance) < 0.01 ? "var(--color-green)" : variance > 0 ? "var(--color-amber)" : "var(--color-red)" }}>
                        {Math.abs(variance) < 0.01 ? "Tallies ✓" : variance > 0 ? `Over by ${formatCurrency(variance)}` : `Short by ${formatCurrency(-variance)}`}
                      </span>
                    )}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button onClick={() => { setShowClose(false); setClosingCash("") }} style={{ height: 38, padding: "0 14px", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-ink-3)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => closeShiftMutation.mutate()} disabled={closingCash === "" || closeShiftMutation.isPending} style={{ height: 38, padding: "0 18px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: closingCash === "" ? .5 : 1 }}>
                        {closeShiftMutation.isPending ? "Closing…" : "Confirm close"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
          <input type="number" min="0" max={1_000_000} step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ Amount" style={{ ...inputStyle({ height: 38, width: 120, fontFamily: "var(--font-mono)" }) }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (supplies, petty cash…)" style={{ ...inputStyle({ height: 38 }), flex: 1 }} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />
          <button onClick={() => { if (amount) createMutation.mutate() }} disabled={!amount || !shiftSummary || createMutation.isPending} title={!shiftSummary ? "Open a shift first" : undefined} style={{ height: 38, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: !shiftSummary ? "not-allowed" : "pointer", opacity: !amount || !shiftSummary ? .4 : 1, flexShrink: 0 }}>Add</button>
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

// ── Bill history tab ─────────────────────────────────────────────────────────
type BillRow = {
  id: string; billNumber: number; createdAt: string
  taxTotal: string; discountAmount: string; total: string
  isPaid: boolean; isVoided?: boolean; paymentModes: string[]
  orderType: string | null; source: string | null
  tableName: string | null; customerName: string | null
  createdByName: string | null; itemCount: number
}
type BillListResponse = { bills: BillRow[]; total: number; page: number; pageSize: number }
type BillDetail = {
  billNumber: number; createdAt: string
  subtotal: string; taxLines: { name: string; rate: number; amount: number }[]
  discountAmount: string
  discountLines?: { id: string; label: string; amount: string }[]
  total: string; isPaid: boolean
  payments: { id: string; mode: string; amount: string }[]
  items: { name: string; quantity: number; unitPrice: string; modifiers: { name: string; price: string }[] }[]
}

const ORDER_TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" }
const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", card: "Card", upi: "UPI", credit: "Credit" }

function BillDetailPanel({ row, onClose }: { row: BillRow; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const { data: bill } = useQuery({ queryKey: ["bill-detail", row.id], queryFn: () => api.bills.get(row.id) as Promise<BillDetail> })
  const { data: outlet } = useQuery({ queryKey: ["outlet"], queryFn: () => api.outlet.get() })

  const invalidateBills = () => {
    qc.invalidateQueries({ queryKey: ["bill-history"] })
    qc.invalidateQueries({ queryKey: ["bill-detail", row.id] })
    qc.invalidateQueries({ queryKey: ["tables"] })
  }
  const voidMutation = useMutation({
    mutationFn: (reason?: string) => api.bills.voidBill(row.id, reason),
    onSuccess: () => { invalidateBills(); onClose() },
    onError: (e: Error) => alert(e.message || "Could not void bill"),
  })
  const refundMutation = useMutation({
    mutationFn: (reason?: string) => api.bills.refundBill(row.id, reason),
    onSuccess: () => { invalidateBills(); onClose() },
    onError: (e: Error) => alert(e.message || "Could not refund bill"),
  })

  function handleVoid() {
    if (!confirm(`Void bill #${row.billNumber}? The order reopens for editing and re-billing.`)) return
    const reason = prompt("Reason (optional):") ?? undefined
    voidMutation.mutate(reason || undefined)
  }
  function handleRefund() {
    if (!confirm(`Refund bill #${row.billNumber}? Loyalty points are reversed, stock is restored, and the bill leaves all reports. Hand the money back to the customer.`)) return
    const reason = prompt("Reason (optional):") ?? undefined
    refundMutation.mutate(reason || undefined)
  }

  const receiptRow = (label: string, value: string, opts?: { dim?: boolean; big?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: opts?.big ? 15 : 12, fontWeight: opts?.big ? 700 : 400, color: opts?.dim ? "var(--color-ink-3)" : "var(--color-ink)" }}>
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  )

  return (
    <SlidePanel title={`Bill #${row.billNumber}`} onClose={onClose} footer={<>
      <CancelBtn onClose={onClose} />
      {!row.isVoided && !row.isPaid && (
        <>
          <button onClick={handleVoid} disabled={voidMutation.isPending}
            style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-red)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {voidMutation.isPending ? "Voiding…" : "Void bill"}
          </button>
          <button onClick={() => navigate({ to: "/billing/$billId", params: { billId: row.id } })}
            style={{ padding: "12px 16px", borderRadius: 10, border: "none", background: "var(--color-green)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Collect payment
          </button>
        </>
      )}
      {!row.isVoided && row.isPaid && role === "owner" && (
        <button onClick={handleRefund} disabled={refundMutation.isPending}
          style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-red)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          {refundMutation.isPending ? "Refunding…" : "Refund bill"}
        </button>
      )}
      <SaveBtn onClick={() => {
        // Reprints are fraud-sensitive (fake "duplicate" receipts) — log them
        api.audit.logEvent({ action: "bill.reprint", entity: "bill", entityId: row.id, details: { billNumber: row.billNumber } }).catch(() => {})
        triggerPrint()
      }} disabled={!bill} label="Print receipt" />
    </>}>
      {!bill ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--color-ink-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {row.isVoided
              ? <span className="badge red">{row.isPaid ? "Refunded" : "Voided"}</span>
              : <span className={`badge ${row.isPaid ? "green" : "amber"}`}>{row.isPaid ? "Paid" : "Unpaid"}</span>}
            <span className="badge">{ORDER_TYPE_LABEL[row.orderType ?? ""] ?? "—"}</span>
            {row.tableName && <span className="badge">Table {row.tableName}</span>}
            {row.createdByName && <span className="badge">By {row.createdByName}</span>}
            {row.customerName && <span className="badge">{row.customerName}</span>}
          </div>

          {/* On-screen receipt — doubles as the print target */}
          <div className="print-receipt" style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: "18px 16px", background: "var(--color-bg)" }}>
            <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "1px dashed var(--color-line-strong)" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{outlet?.name ?? "InBill"}</div>
              {outlet?.address && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>{outlet.address}</div>}
              {outlet?.gstin && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>GSTIN {outlet.gstin}</div>}
              {outlet?.fssaiNumber && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>FSSAI {outlet.fssaiNumber}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 12, color: "var(--color-ink-3)" }}>
              <span>Bill #{bill.billNumber}</span>
              <span>{new Date(bill.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>

            <div style={{ borderTop: "1px solid var(--color-line)" }}>
              {bill.items.map((l, i) => (
                <div key={i} style={{ borderBottom: "1px solid var(--color-line)", padding: "8px 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 84px", fontSize: 13, alignItems: "center" }}>
                    <span style={{ fontWeight: 500 }}>{l.name}</span>
                    <span style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>{l.quantity}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{formatCurrency(lineTotal(l))}</span>
                  </div>
                  {(l.modifiers ?? []).map((m, mi) => (
                    <div key={mi} style={{ display: "grid", gridTemplateColumns: "1fr 36px 84px", fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>
                      <span style={{ paddingLeft: 6 }}>+ {m.name}</span><span />
                      <span style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{formatCurrency(Number(m.price) * l.quantity)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ paddingTop: 10 }}>
              {receiptRow("Subtotal", formatCurrency(bill.subtotal))}
              {(bill.discountLines ?? []).length > 0
                ? (bill.discountLines ?? []).map((line, i) => <div key={i}>{receiptRow(line.label, "− " + formatCurrency(line.amount), { dim: true })}</div>)
                : Number(bill.discountAmount) > 0 && receiptRow("Discount", "− " + formatCurrency(bill.discountAmount), { dim: true })}
              {bill.taxLines.map((line, i) => <div key={i}>{receiptRow(`${line.name} (${line.rate}%)`, formatCurrency(line.amount), { dim: true })}</div>)}
              <div style={{ height: 1, background: "var(--color-line-strong)", margin: "8px 0" }} />
              {receiptRow("Total", formatCurrency(bill.total), { big: true })}
            </div>

            {bill.payments.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--color-line)" }}>
                {bill.payments.map((p) => receiptRow(PAYMENT_LABEL[p.mode] ?? p.mode, formatCurrency(p.amount), { dim: true }))}
              </div>
            )}
          </div>
        </>
      )}
    </SlidePanel>
  )
}

function BillsTab() {
  const today = new Date().toISOString().split("T")[0]!
  const [from, setFrom]     = useState(today)
  const [to, setTo]         = useState(today)
  const [preset, setPreset] = useState(0)
  const [status, setStatus] = useState<"all" | "paid" | "unpaid">("all")
  const [search, setSearch] = useState("")
  const [page, setPage]     = useState(1)
  const [selected, setSelected] = useState<BillRow | null>(null)

  function applyPreset(idx: number) {
    setPreset(idx)
    setFrom(PRESETS[idx]!.from())
    setTo(PRESETS[idx]!.to())
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ["bill-history", from, to, status, search, page],
    queryFn: () => api.bills.list({ from, to, status, q: search.trim() || undefined, page }) as Promise<BillListResponse>,
  })

  const rows      = data?.bills ?? []
  const total     = data?.total ?? 0
  const pageSize  = data?.pageSize ?? 50
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const dateInputStyle: React.CSSProperties = { height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }
  const gridCols = "70px 130px 1fr 52px 110px 120px 96px 76px"

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Bill History</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Every bill raised at this outlet — open one to view or reprint the receipt</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + (preset === i ? "var(--color-ink)" : "var(--color-line)"), background: preset === i ? "var(--color-ink)" : "transparent", color: preset === i ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(-1); setPage(1) }} style={dateInputStyle} />
          <span style={{ color: "var(--color-ink-3)" }}>–</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(-1); setPage(1) }} style={dateInputStyle} />
          <div style={{ flex: 1 }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Bill #" inputMode="numeric" style={{ ...dateInputStyle, width: 90, fontFamily: "var(--font-mono)" }} />
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "paid", "unpaid"] as const).map((s) => (
              <button key={s} onClick={() => { setStatus(s); setPage(1) }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + (status === s ? "var(--color-ink)" : "var(--color-line)"), background: status === s ? "var(--color-ink)" : "transparent", color: status === s ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer", textTransform: "capitalize" }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 10 }}>
          {isLoading ? "Loading…" : `${total} bill${total !== 1 ? "s" : ""} in this period`}
        </div>

        <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "10px 18px", gap: 10, fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)" }}>
            <span>Bill #</span><span>When</span><span>Table / Type</span><span style={{ textAlign: "center" }}>Items</span><span>Staff</span><span>Payment</span><span style={{ textAlign: "right" }}>Total</span><span style={{ textAlign: "center" }}>Status</span>
          </div>
          {rows.length === 0 && !isLoading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)", fontSize: 13 }}>No bills in this period</div>
          )}
          {rows.map((b, i) => (
            <div key={b.id} onClick={() => setSelected(b)}
              style={{ display: "grid", gridTemplateColumns: gridCols, padding: "12px 18px", gap: 10, alignItems: "center", fontSize: 13, borderBottom: i < rows.length - 1 ? "1px solid var(--color-line)" : "none", cursor: "pointer" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--color-surface)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{b.billNumber}</span>
              <span style={{ color: "var(--color-ink-2)", fontSize: 12 }}>{new Date(b.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.tableName ?? ORDER_TYPE_LABEL[b.orderType ?? ""] ?? "—"}
                {b.customerName && <span style={{ color: "var(--color-ink-3)", fontSize: 12 }}> · {b.customerName}</span>}
              </span>
              <span style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>{b.itemCount}</span>
              <span style={{ color: "var(--color-ink-2)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.createdByName ?? "—"}</span>
              <span style={{ color: "var(--color-ink-2)", fontSize: 12 }}>{b.paymentModes.length > 0 ? b.paymentModes.map((m) => PAYMENT_LABEL[m] ?? m).join(" + ") : "—"}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatCurrency(b.total)}</span>
              <span style={{ textAlign: "center" }}>
                {b.isVoided
                  ? <span className="badge red">{b.isPaid ? "Refunded" : "Voided"}</span>
                  : <span className={`badge ${b.isPaid ? "green" : "amber"}`}>{b.isPaid ? "Paid" : "Unpaid"}</span>}
              </span>
            </div>
          ))}
        </div>

        {pageCount > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? .4 : 1 }}>← Prev</button>
            <span style={{ fontSize: 12, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{page} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: page >= pageCount ? "not-allowed" : "pointer", opacity: page >= pageCount ? .4 : 1 }}>Next →</button>
          </div>
        )}
      </div>

      {selected && <BillDetailPanel row={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ── Day close / Z-report tab ─────────────────────────────────────────────────
type DaySummaryData = {
  date: string; billCount: number; grossSales: number; taxTotal: number; discountTotal: number
  unpaidCount: number; unpaidTotal: number; voidCount: number; voidTotal: number
  byMode: Record<string, number>; openingFloat: number; cashIn: number; cashOut: number
  expectedCash: number; openOrders: number
}
type DayCloseRow = { id: string; businessDate: string; expectedCash: string; countedCash: string; note: string | null; closedAt: string; summary: DaySummaryData }

function DayCloseTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().split("T")[0]!
  const [date, setDate] = useState(today)
  const [countedCash, setCountedCash] = useState("")
  const [note, setNote] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["day-close", date],
    queryFn: () => api.shifts.getDayClose(date) as Promise<{ closed: DayCloseRow | null; preview: DaySummaryData | null }>,
  })

  const closeMutation = useMutation({
    mutationFn: () => api.shifts.closeDay({ date, countedCash: parseFloat(countedCash), note: note.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["day-close"] }); setCountedCash(""); setNote("") },
    onError: (err: Error) => alert(err.message),
  })

  const closed  = data?.closed ?? null
  const summary = closed?.summary ?? data?.preview ?? null
  const expectedCash = summary?.expectedCash ?? 0
  const counted = closed ? Number(closed.countedCash) : parseFloat(countedCash)
  const variance = Number.isFinite(counted) ? counted - (closed ? Number(closed.expectedCash) : expectedCash) : null

  const zRow = (label: string, value: string, opts?: { dim?: boolean; big?: boolean; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: opts?.big ? 15 : 13, fontWeight: opts?.big ? 700 : 400, color: opts?.color ?? (opts?.dim ? "var(--color-ink-3)" : "var(--color-ink)") }}>
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  )
  const divider = <div style={{ height: 1, background: "var(--color-line-strong)", margin: "10px 0" }} />

  function handleClose() {
    if (!Number.isFinite(parseFloat(countedCash))) return
    if (summary && summary.openOrders > 0 && !confirm(`${summary.openOrders} order(s) are still open. Close the day anyway?`)) return
    if (!confirm(`Close ${date}? Bills on this day become locked — no voids, refunds, or edits afterwards.`)) return
    closeMutation.mutate()
  }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Day Close</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>End-of-day settlement — count the drawer, lock the day, print the Z-report</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          {closed && <span className="badge green">Closed {new Date(closed.closedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
          {!closed && !isLoading && <span className="badge amber">Not closed</span>}
          <div style={{ flex: 1 }} />
          {closed && (
            <button onClick={() => triggerPrint()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Z-report
            </button>
          )}
        </div>

        {isLoading && <div style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)", fontSize: 13 }}>Loading…</div>}

        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 440px) 1fr", gap: 24, alignItems: "start" }}>
            {/* Z-report (print target) */}
            <div className="print-receipt" style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: "18px 20px", background: "var(--color-bg)" }}>
              <div style={{ textAlign: "center", paddingBottom: 12, borderBottom: "1px dashed var(--color-line-strong)", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Z-Report</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>{date}</div>
              </div>
              {zRow("Bills settled", String(summary.billCount))}
              {zRow("Gross sales", formatCurrency(summary.grossSales), { big: true })}
              {zRow("Tax collected", formatCurrency(summary.taxTotal), { dim: true })}
              {zRow("Discounts given", "− " + formatCurrency(summary.discountTotal), { dim: true })}
              {summary.voidCount > 0 && zRow(`Voided/refunded (${summary.voidCount})`, formatCurrency(summary.voidTotal), { dim: true })}
              {summary.unpaidCount > 0 && zRow(`Unpaid bills (${summary.unpaidCount})`, formatCurrency(summary.unpaidTotal), { color: "var(--color-amber)" })}
              {divider}
              {zRow("Cash", formatCurrency(summary.byMode.cash ?? 0))}
              {zRow("Card", formatCurrency(summary.byMode.card ?? 0))}
              {zRow("UPI", formatCurrency(summary.byMode.upi ?? 0))}
              {(summary.byMode.credit ?? 0) > 0 && zRow("Credit", formatCurrency(summary.byMode.credit ?? 0))}
              {divider}
              {zRow("Opening float", formatCurrency(summary.openingFloat), { dim: true })}
              {zRow("Cash sales", "+ " + formatCurrency(summary.byMode.cash ?? 0), { dim: true })}
              {zRow("Cash in", "+ " + formatCurrency(summary.cashIn), { dim: true })}
              {zRow("Cash out", "− " + formatCurrency(summary.cashOut), { dim: true })}
              {zRow("Expected in drawer", formatCurrency(closed ? Number(closed.expectedCash) : summary.expectedCash), { big: true })}
              {closed && (
                <>
                  {zRow("Counted", formatCurrency(Number(closed.countedCash)), { big: true })}
                  {variance !== null && zRow("Variance", (variance >= 0 ? "+" : "−") + formatCurrency(Math.abs(variance)), { big: true, color: Math.abs(variance) < 1 ? "var(--color-green)" : "var(--color-red)" })}
                  {closed.note && <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 8, borderTop: "1px dashed var(--color-line)", paddingTop: 8 }}>Note: {closed.note}</div>}
                </>
              )}
            </div>

            {/* Close form / status */}
            {!closed ? (
              <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: "18px 20px", background: "var(--color-surface)", maxWidth: 420 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Close this day</div>
                <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
                  Count the physical cash in the drawer and enter it below. Closing locks every bill on {date} — voids, refunds, discounts and payments are blocked afterwards.
                </div>
                {summary.openOrders > 0 && (
                  <div style={{ fontSize: 12, color: "var(--color-amber)", marginBottom: 12, padding: "8px 12px", background: "var(--color-amber-soft, #fff8e1)", borderRadius: 8 }}>
                    ⚠ {summary.openOrders} order(s) still open — settle or cancel them first for a clean close.
                  </div>
                )}
                {summary.unpaidCount > 0 && (
                  <div style={{ fontSize: 12, color: "var(--color-amber)", marginBottom: 12, padding: "8px 12px", background: "var(--color-amber-soft, #fff8e1)", borderRadius: 8 }}>
                    ⚠ {summary.unpaidCount} unpaid bill(s) worth {formatCurrency(summary.unpaidTotal)} on this day.
                  </div>
                )}
                {field("Counted cash (₹)", <input type="number" min="0" step="0.5" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder={String(summary.expectedCash)} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
                {Number.isFinite(parseFloat(countedCash)) && variance !== null && (
                  <div style={{ fontSize: 12, marginTop: -8, marginBottom: 12, color: Math.abs(variance) < 1 ? "var(--color-green)" : "var(--color-red)" }}>
                    Variance vs expected: {variance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(variance))}
                  </div>
                )}
                {field("Note (optional)", <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₹200 short — till float error" maxLength={300} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
                <button onClick={handleClose} disabled={!Number.isFinite(parseFloat(countedCash)) || closeMutation.isPending}
                  style={{ width: "100%", marginTop: 4, padding: "12px 0", borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: !Number.isFinite(parseFloat(countedCash)) ? .4 : 1 }}>
                  {closeMutation.isPending ? "Closing…" : `Close ${date}`}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.6, maxWidth: 420 }}>
                This day is closed and its bills are locked. Use the date picker to review other days.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Activity log tab ─────────────────────────────────────────────────────────
type AuditEvent = { id: string; userName: string | null; action: string; entity: string; entityId: string | null; details: Record<string, unknown>; createdAt: string }

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "bill.void": "Bill voided", "bill.refund": "Bill refunded", "bill.reprint": "Receipt reprinted",
  "discount.apply": "Discount applied", "discount.remove": "Discount removed",
  "order_item.void": "Item voided",
  "cash.in": "Cash in", "cash.out": "Cash out", "cash.entry_delete": "Cash entry deleted",
  "shift.open": "Shift opened", "shift.close": "Shift closed",
  "menu.price_change": "Price changed",
  "staff.create": "Staff added", "staff.update": "Staff updated", "staff.disable": "Staff disabled",
  "day.close": "Day closed",
}

const AUDIT_FILTERS: { label: string; prefix: string }[] = [
  { label: "All", prefix: "" },
  { label: "Bills", prefix: "bill." },
  { label: "Discounts", prefix: "discount." },
  { label: "Items", prefix: "order_item." },
  { label: "Cash", prefix: "cash." },
  { label: "Menu", prefix: "menu." },
  { label: "Staff", prefix: "staff." },
]

function auditDetailText(e: AuditEvent): string {
  const d = e.details ?? {}
  const rupees = (v: unknown) => formatCurrency(Number(v ?? 0))
  switch (e.action) {
    case "bill.void":
    case "bill.refund":   return `Bill #${d.billNumber} · ${rupees(d.total)}${d.reason ? ` · "${d.reason}"` : ""}`
    case "bill.reprint":  return `Bill #${d.billNumber}`
    case "discount.apply":  return `${d.label} · − ${rupees(d.amount)} on bill #${d.billNumber}`
    case "discount.remove": return `${d.label} · ${rupees(d.amount)} removed from bill #${d.billNumber}`
    case "order_item.void": return `${d.qty} × ${d.itemName} · ${rupees(d.unitPrice)}`
    case "cash.in":
    case "cash.out":       return `${rupees(d.amount)}${d.note ? ` · ${d.note}` : ""}`
    case "cash.entry_delete": return `${d.type === "in" ? "Cash in" : "Expense"} of ${rupees(d.amount)} deleted${d.note ? ` · ${d.note}` : ""}`
    case "shift.open":     return `Opening float ${rupees(d.openingCash)}`
    case "shift.close":    return `Float ${rupees(d.openingCash)} → counted ${rupees(d.closingCash)}`
    case "menu.price_change": return `${d.name}: ${rupees(d.from)} → ${rupees(d.to)}`
    case "staff.create":   return `${d.name} (${d.role})`
    case "staff.update":   return `${d.name}${d.pinReset ? " · PIN reset" : ""}${d.isActive === false ? " · disabled" : ""}`
    case "staff.disable":  return `${d.name}`
    case "day.close":      return `${d.date} · expected ${rupees(d.expectedCash)}, counted ${rupees(d.countedCash)}`
    default: return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(" · ")
  }
}

function ActivityTab() {
  const today = new Date().toISOString().split("T")[0]!
  const [from, setFrom]     = useState(today)
  const [to, setTo]         = useState(today)
  const [preset, setPreset] = useState(0)
  const [filter, setFilter] = useState("")
  const [page, setPage]     = useState(1)

  function applyPreset(idx: number) {
    setPreset(idx)
    setFrom(PRESETS[idx]!.from())
    setTo(PRESETS[idx]!.to())
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ["audit", from, to, filter, page],
    queryFn: () => api.audit.list({ from, to, action: filter || undefined, page }) as Promise<{ events: AuditEvent[]; total: number; page: number; pageSize: number }>,
  })

  const events    = data?.events ?? []
  const total     = data?.total ?? 0
  const pageSize  = data?.pageSize ?? 50
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const dateInputStyle: React.CSSProperties = { height: 34, padding: "0 10px", border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Activity Log</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Who did what, and when — voids, refunds, discounts, cash movements, price changes</div>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {PRESETS.map((p, i) => (
              <button key={p.label} onClick={() => applyPreset(i)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + (preset === i ? "var(--color-ink)" : "var(--color-line)"), background: preset === i ? "var(--color-ink)" : "transparent", color: preset === i ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(-1); setPage(1) }} style={dateInputStyle} />
          <span style={{ color: "var(--color-ink-3)" }}>–</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(-1); setPage(1) }} style={dateInputStyle} />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {AUDIT_FILTERS.map((f) => (
              <button key={f.prefix} onClick={() => { setFilter(f.prefix); setPage(1) }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + (filter === f.prefix ? "var(--color-ink)" : "var(--color-line)"), background: filter === f.prefix ? "var(--color-ink)" : "transparent", color: filter === f.prefix ? "var(--color-bg)" : "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 10 }}>
          {isLoading ? "Loading…" : `${total} event${total !== 1 ? "s" : ""} in this period`}
        </div>

        <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
          {events.length === 0 && !isLoading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--color-ink-3)", fontSize: 13 }}>No activity in this period</div>
          )}
          {events.map((e, i) => (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "130px 140px 170px 1fr", padding: "11px 18px", gap: 12, alignItems: "center", fontSize: 13, borderBottom: i < events.length - 1 ? "1px solid var(--color-line)" : "none" }}>
              <span style={{ color: "var(--color-ink-3)", fontSize: 12 }}>{new Date(e.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{e.userName ?? "—"}</span>
              <span>
                <span className={`badge ${e.action === "bill.void" || e.action === "bill.refund" || e.action === "order_item.void" ? "red" : e.action.startsWith("cash.") || e.action.startsWith("discount.") ? "amber" : ""}`}>
                  {AUDIT_ACTION_LABEL[e.action] ?? e.action}
                </span>
              </span>
              <span style={{ color: "var(--color-ink-2)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auditDetailText(e)}</span>
            </div>
          ))}
        </div>

        {pageCount > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? .4 : 1 }}>← Prev</button>
            <span style={{ fontSize: 12, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{page} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: page >= pageCount ? "not-allowed" : "pointer", opacity: page >= pageCount ? .4 : 1 }}>Next →</button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Menu schedules tab ───────────────────────────────────────────────────────
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type EditSchedule = { _new?: boolean; id?: string; name: string; days: number[]; startTime: string; endTime: string; percentOff: string }

function ScheduleEditPanel({ schedule, categories, onClose, onSaved }: { schedule: EditSchedule; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !!schedule._new
  const [name, setName] = useState(schedule.name)
  const [days, setDays] = useState<number[]>(schedule.days)
  const [startTime, setStartTime] = useState(schedule.startTime)
  const [endTime, setEndTime] = useState(schedule.endTime)
  const [percentOff, setPercentOff] = useState(schedule.percentOff)
  // Categories currently pointing at this schedule (assignment lives on the category)
  const [catIds, setCatIds] = useState<Set<string>>(new Set(categories.filter((c) => c.scheduleId === schedule.id).map((c) => c.id)))

  const pct = parseFloat(percentOff || "0")
  const canSave = name.trim() && startTime && endTime && pct >= 0 && pct <= 100

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), days, startTime, endTime, percentOff: pct }
      const saved = isNew
        ? (await api.menu.createSchedule(body)) as { id: string }
        : ((await api.menu.updateSchedule(schedule.id!, body)) as { id: string })
      // Sync category assignments to match the checkboxes
      const scheduleId = saved.id
      const wasAssigned = new Set(categories.filter((c) => c.scheduleId === schedule.id && schedule.id).map((c) => c.id))
      for (const cat of categories) {
        const nowChecked = catIds.has(cat.id)
        const wasChecked = wasAssigned.has(cat.id)
        if (nowChecked && !wasChecked) await api.menu.updateCategory(cat.id, { scheduleId })
        if (!nowChecked && wasChecked) await api.menu.updateCategory(cat.id, { scheduleId: null })
      }
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (err: Error) => alert(err.message),
  })

  const toggleDay = (d: number) => setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())

  return (
    <SlidePanel title={isNew ? "Add schedule" : `Edit "${schedule.name}"`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={() => canSave && saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} label={saveMutation.isPending ? "Saving…" : isNew ? "Add schedule" : "Save"} /></>}>
      {field("Name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast, Happy Hour" maxLength={100} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Days <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(none selected = every day)</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          {DAY_LABELS.map((label, d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid " + (days.includes(d) ? "var(--color-ink)" : "var(--color-line)"), background: days.includes(d) ? "var(--color-ink)" : "var(--color-surface)", color: days.includes(d) ? "var(--color-bg)" : "var(--color-ink-3)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {field("From", <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle({ fontFamily: "var(--font-mono)" })} />)}
        {field("To", <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle({ fontFamily: "var(--font-mono)" })} />)}
      </div>
      {endTime < startTime && startTime && endTime && (
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: -10 }}>Window wraps past midnight ({startTime} → {endTime} next day)</div>
      )}
      {field("Happy-hour discount % (optional)", <input type="number" min="0" max="100" step="1" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} placeholder="0 = availability window only" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Applies to categories <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(individual items can also be assigned from the item editor)</span></div>
        <div style={{ border: "1px solid var(--color-line)", borderRadius: 10, overflow: "hidden" }}>
          {categories.filter((c) => c.isActive).map((cat, i, arr) => (
            <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--color-line)" : "none", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={catIds.has(cat.id)} onChange={(e) => setCatIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(cat.id); else next.delete(cat.id); return next })} />
              <span>{cat.name}</span>
              {cat.scheduleId && cat.scheduleId !== schedule.id && <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>currently on another schedule</span>}
            </label>
          ))}
          {categories.filter((c) => c.isActive).length === 0 && <div style={{ padding: 16, fontSize: 12, color: "var(--color-ink-3)", textAlign: "center" }}>No categories yet</div>}
        </div>
      </div>
    </SlidePanel>
  )
}

function SchedulesTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<EditSchedule | null>(null)

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: Category[]; items: MenuItemRow[]; schedules: MenuSchedule[] }> })
  const schedules = menu?.schedules ?? []
  const categories = menu?.categories ?? []
  const items = menu?.items ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteSchedule(id), onSuccess: invalidate })
  const toggleMutation = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.menu.updateSchedule(id, { isActive }), onSuccess: invalidate })

  const usageFor = (s: MenuSchedule) => {
    const cats = categories.filter((c) => c.scheduleId === s.id).length
    const its  = items.filter((i) => i.scheduleId === s.id).length
    const parts = []
    if (cats > 0) parts.push(`${cats} categor${cats === 1 ? "y" : "ies"}`)
    if (its > 0) parts.push(`${its} item${its === 1 ? "" : "s"}`)
    return parts.length ? parts.join(" · ") : "Not assigned yet"
  }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Menu Schedules</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Time-windowed menus and happy hours — items outside their window can't be ordered</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing({ _new: true, name: "", days: [], startTime: "07:00", endTime: "11:00", percentOff: "0" })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add schedule
        </button>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        {schedules.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-ink-3)" }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No schedules yet</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>Create one for a breakfast-only menu, or a happy hour with automatic discounts.<br />Assign it to categories here, or to individual items from the item editor.</div>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
            {schedules.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: i < schedules.length - 1 ? "1px solid var(--color-line)" : "none", gap: 14, opacity: s.isActive ? 1 : .5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                    {s.activeNow && s.isActive && <span className="badge green">Live now</span>}
                    {Number(s.percentOff) > 0 && <span className="badge amber">{Number(s.percentOff)}% off</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 3 }}>
                    {(s.days ?? []).length === 0 ? "Every day" : (s.days ?? []).map((d) => DAY_LABELS[d]).join(", ")} · {s.startTime}–{s.endTime}{s.endTime < s.startTime ? " (+1 day)" : ""} · {usageFor(s)}
                  </div>
                </div>
                <button onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                  {s.isActive ? "Disable" : "Enable"}
                </button>
                <ActionBtn onClick={() => setEditing({ id: s.id, name: s.name, days: s.days ?? [], startTime: s.startTime, endTime: s.endTime, percentOff: String(Number(s.percentOff)) })} title="Edit" />
                <ActionBtn onClick={() => { if (confirm(`Delete "${s.name}"? Items and categories using it become always available.`)) deleteMutation.mutate(s.id) }} title="Delete" danger />
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <ScheduleEditPanel schedule={editing} categories={categories} onClose={() => setEditing(null)} onSaved={invalidate} />}
    </>
  )
}

// ── Kitchen stations tab (paid feature) ──────────────────────────────────────
const STATION_COLORS = ["#f97316", "#ef4444", "#22c55e", "#3b82f6", "#8b5cf6", "#14b8a6", "#ec4899", "#f59e0b"]

type EditStation = { _new?: boolean; id?: string; name: string; color: string; isActive: boolean }

function capPlan(p?: string) { return p ? p[0]!.toUpperCase() + p.slice(1) : "" }

function StationsTab() {
  const qc = useQueryClient()
  const feature = useFeature("kitchen_stations")
  const openUpgrade = useUpgradeStore((s) => s.open)
  const [editing, setEditing] = useState<EditStation | null>(null)

  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: Category[]; items: MenuItemRow[]; stations: Station[] }> })
  const stations = menu?.stations ?? []
  const categories = menu?.categories ?? []
  const items = menu?.items ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] })
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.menu.deleteStation(id), onSuccess: invalidate })
  const toggleMutation = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.menu.updateStation(id, { isActive }), onSuccess: invalidate })

  const usageFor = (s: Station) => {
    const cats = categories.filter((c) => c.stationId === s.id).length
    const its = items.filter((i) => i.stationId === s.id).length
    const parts: string[] = []
    if (cats > 0) parts.push(`${cats} categor${cats === 1 ? "y" : "ies"}`)
    if (its > 0) parts.push(`${its} item${its === 1 ? "" : "s"}`)
    return parts.length ? parts.join(" · ") : "Not assigned yet"
  }

  // Gated: the KDS/routing is core, but configuring stations is a paid feature.
  if (!isUsable(feature)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ display: "inline-flex", marginBottom: 12 }}><LockBadge /></div>
          <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>{FEATURES.kitchen_stations.label}</h3>
          <p style={{ fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.65, marginBottom: 22 }}>{FEATURES.kitchen_stations.pitch}</p>
          <button
            onClick={() => openUpgrade({ feature: "kitchen_stations", reason: feature.reason ?? "plan_required", requiredPlan: feature.requiredPlan })}
            style={{ padding: "11px 22px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
          >
            {feature.requiredPlan ? `Upgrade to ${capPlan(feature.requiredPlan)}` : "Upgrade to unlock"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Kitchen Stations</h3>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Route dishes to the right part of the line — each station gets its own KOT ticket and KDS tab</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing({ _new: true, name: "", color: STATION_COLORS[0]!, isActive: true })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Add station
        </button>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "20px 28px" }}>
        {stations.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--color-ink-3)" }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No stations yet</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>Add stations like Tandoor, Curries or Bar.<br />Assign categories here, or override individual items from the item editor. Until you add one, orders fire as a single ticket.</div>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
            {stations.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: i < stations.length - 1 ? "1px solid var(--color-line)" : "none", gap: 14, opacity: s.isActive ? 1 : .5 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 3 }}>{usageFor(s)}</div>
                </div>
                <button onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-line-strong)", background: "var(--color-surface)", color: "var(--color-ink-2)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                  {s.isActive ? "Disable" : "Enable"}
                </button>
                <ActionBtn onClick={() => setEditing({ id: s.id, name: s.name, color: s.color, isActive: s.isActive })} title="Edit" />
                <ActionBtn onClick={() => { if (confirm(`Delete "${s.name}"? Items and categories using it become unassigned.`)) deleteMutation.mutate(s.id) }} title="Delete" danger />
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <StationEditPanel station={editing} categories={categories} onClose={() => setEditing(null)} onSaved={invalidate} />}
    </>
  )
}

function StationEditPanel({ station, categories, onClose, onSaved }: { station: EditStation; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !!station._new
  const [name, setName] = useState(station.name)
  const [color, setColor] = useState(station.color)
  // Categories currently pointing at this station (assignment lives on the category)
  const [catIds, setCatIds] = useState<Set<string>>(new Set(categories.filter((c) => c.stationId === station.id).map((c) => c.id)))

  const canSave = !!name.trim()

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), color }
      const saved = isNew
        ? (await api.menu.createStation(body)) as { id: string }
        : ((await api.menu.updateStation(station.id!, body)) as { id: string })
      // Sync category assignments to match the checkboxes
      const stationId = saved.id
      const wasAssigned = new Set(categories.filter((c) => c.stationId === station.id && station.id).map((c) => c.id))
      for (const cat of categories) {
        const nowChecked = catIds.has(cat.id)
        const wasChecked = wasAssigned.has(cat.id)
        if (nowChecked && !wasChecked) await api.menu.updateCategory(cat.id, { stationId })
        if (!nowChecked && wasChecked) await api.menu.updateCategory(cat.id, { stationId: null })
      }
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (err: Error) => alert(err.message),
  })

  return (
    <SlidePanel title={isNew ? "Add station" : `Edit "${station.name}"`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><SaveBtn onClick={() => canSave && saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} label={saveMutation.isPending ? "Saving…" : isNew ? "Add station" : "Save"} /></>}>
      {field("Name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tandoor, Curries, Bar" maxLength={60} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Colour <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(shown on the KDS tab &amp; ticket)</span></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {STATION_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: color.toLowerCase() === c.toLowerCase() ? "2px solid var(--color-ink)" : "2px solid transparent", cursor: "pointer", flexShrink: 0 }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Custom colour" style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--color-line-strong)", borderRadius: 8, background: "var(--color-surface)", cursor: "pointer" }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 8 }}>Applies to categories <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(individual items can override from the item editor)</span></div>
        <div style={{ border: "1px solid var(--color-line)", borderRadius: 10, overflow: "hidden" }}>
          {categories.filter((c) => c.isActive).map((cat, i, arr) => (
            <label key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < arr.length - 1 ? "1px solid var(--color-line)" : "none", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={catIds.has(cat.id)} onChange={(e) => setCatIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(cat.id); else next.delete(cat.id); return next })} />
              <span>{cat.name}</span>
              {cat.stationId && cat.stationId !== station.id && <span style={{ fontSize: 11, color: "var(--color-ink-3)" }}>currently on another station</span>}
            </label>
          ))}
          {categories.filter((c) => c.isActive).length === 0 && <div style={{ padding: 16, fontSize: 12, color: "var(--color-ink-3)", textAlign: "center" }}>No categories yet</div>}
        </div>
      </div>
    </SlidePanel>
  )
}

// ── Devices tab (placeholder) ────────────────────────────────────────────────
function DevicesTab() {
  const { data: lanData } = useQuery({
    queryKey: ["lan-url"],
    queryFn: () => api.public.lanUrl(),
    staleTime: 30_000,
  })

  const { data: outletData } = useQuery({
    queryKey: ["outlet-info"],
    queryFn: () => api.outlet.get(),
    staleTime: Infinity,
  })
  const persistedSetupCode = useAuthStore((s) => s.setupCode)
  // Canonical setup code from the outlet record wins over the value typed at
  // device setup (which may differ in casing and is persisted across sessions).
  const setupCode = outletData?.setupCode ?? persistedSetupCode
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const lanUrls = lanData?.urls ?? []
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  // Cloud mode returns no LAN IPs (there's no meaningful "same network") —
  // the deployed origin itself is already reachable from any device.
  const activeUrl = selectedUrl ?? lanUrls[0] ?? (isLocalhost ? null : window.location.origin)
  const mobileUrl = activeUrl
    ? `${activeUrl}/mobile${setupCode ? `?setup=${encodeURIComponent(setupCode)}` : ""}`
    : null
  const hostUrl = activeUrl
    ? `${activeUrl}/host/${setupCode ? `?setup=${encodeURIComponent(setupCode)}` : ""}`
    : null
  const noLan = isLocalhost && lanUrls.length === 0

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Devices</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Connect captain phones and tablets to this outlet</div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: "28px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Captain app card */}
        <DeviceCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeWidth="2.5"/></svg>}
          iconBg="var(--color-accent-soft)"
          title="Captain App"
          subtitle="Order-taking app for waiters — runs in any phone browser"
          url={mobileUrl}
          noLan={noLan}
          steps={["Connect the phone to the same Wi-Fi network as this PC", "Scan the QR code or open the URL below", "Log in with your captain PIN"]}
          lanUrls={lanUrls}
          activeUrl={activeUrl}
          onSelectUrl={setSelectedUrl}
        />

        {/* Host app card */}
        <DeviceCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          iconBg="var(--color-surface-2)"
          title="Host App"
          subtitle="Queue &amp; seating management — runs on a tablet at the front desk"
          url={hostUrl}
          noLan={noLan}
          steps={["Place a tablet at the front desk on the same Wi-Fi", "Scan the QR code — outlet is set up automatically", "Log in with the host staff PIN"]}
          lanUrls={lanUrls}
          activeUrl={activeUrl}
          onSelectUrl={setSelectedUrl}
        />
      </div>
    </>
  )
}

function DeviceCard({ icon, iconBg, title, subtitle, url, noLan, steps, lanUrls, activeUrl, onSelectUrl }: {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  url: string | null
  noLan: boolean
  steps: string[]
  lanUrls: string[]
  activeUrl: string | null
  onSelectUrl: (u: string) => void
}) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, overflow: "hidden", maxWidth: 520 }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{subtitle}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px" }}>
        {noLan ? (
          <div style={{ fontSize: 13, color: "var(--color-amber)", background: "var(--color-amber-soft)", borderRadius: 10, padding: "12px 14px" }}>
            Open the POS via the machine's LAN IP address (not localhost) to generate a working QR code for other devices.
          </div>
        ) : !url ? (
          <div style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Detecting network address…</div>
        ) : (
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid var(--color-line)", flexShrink: 0 }}>
              <QRCode value={url} size={160} />
            </div>

            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-ink-3)", marginBottom: 8 }}>
                How to connect
              </div>
              <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {steps.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--color-ink-2)", lineHeight: 1.4 }}>{step}</li>
                ))}
              </ol>

              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "var(--color-surface-2)", borderRadius: 8, padding: "8px 10px", border: "1px solid var(--color-line)" }}>
                <span style={{ flex: 1, fontSize: 12, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "var(--color-ink-2)" }}>{url}</span>
                <button
                  onClick={() => void navigator.clipboard.writeText(url)}
                  title="Copy URL"
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: "var(--color-ink-3)", flexShrink: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>

              {lanUrls.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginBottom: 4 }}>Multiple network interfaces detected:</div>
                  <select
                    value={activeUrl ?? ""}
                    onChange={(e) => onSelectUrl(e.target.value)}
                    style={{ width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 12, padding: "0 8px", fontFamily: "var(--font-mono)" }}
                  >
                    {lanUrls.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Discounts tab ────────────────────────────────────────────────────────────
function DiscountsTab() {
  const qc = useQueryClient()
  const isOwner = useAuthStore((s) => s.user?.role === "owner")
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
    if (rest.name.trim().length > 100) { setErr("Name must be 100 characters or less"); return }
    const numVal = parseFloat(String(rest.value))
    if (isNaN(numVal) || numVal <= 0) { setErr("Value must be a positive number"); return }
    if ((rest.type ?? "percentage") === "percentage" && numVal > 100) { setErr("Percentage discount cannot exceed 100%"); return }
    if ((rest.type ?? "percentage") === "flat" && numVal > 1_000_000) { setErr("Flat discount cannot exceed ₹10,00,000"); return }
    const code = rest.code?.trim()
    if (code && !/^[A-Z0-9_-]{1,20}$/.test(code)) { setErr("Coupon code must be 1–20 uppercase letters, digits, _ or -"); return }
    if (rest.validFrom && rest.validTo && rest.validTo < rest.validFrom) { setErr("'Valid to' must be on or after 'Valid from'"); return }
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
        {isOwner && (
          <button onClick={() => { setEditing(blank); setErr("") }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "var(--color-ink)", border: "none", color: "var(--color-bg)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>New discount
          </button>
        )}
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
            {isOwner && <ActionBtn onClick={() => { setEditing({ ...row }); setErr("") }} title="Edit" />}
            {isOwner && <ActionBtn onClick={() => { if (confirm(`Delete "${row.name}"?`)) deleteMutation.mutate(row.id) }} title="Delete" danger />}
          </div>
        ))}
      </div>

      {editing && (
        <SlidePanel title={editing._new ? "New discount" : `Edit "${editing.name}"`} onClose={() => setEditing(null)}
          footer={<><CancelBtn onClose={() => setEditing(null)} /><SaveBtn onClick={handleSave} disabled={isPending} label={isPending ? "Saving…" : editing._new ? "Create" : "Save"} /></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {err && <div style={{ padding: "10px 14px", background: "var(--color-red-soft)", color: "var(--color-red)", borderRadius: 8, fontSize: 13 }}>{err}</div>}
            {field("Discount name", <input value={editing.name ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, name: e.target.value }))} placeholder="e.g. Happy Hour, Staff Discount" maxLength={100} style={inputStyle()} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Type", (
                <select value={editing.type ?? "percentage"} onChange={(e) => setEditing((d) => ({ ...d!, type: e.target.value as "percentage" | "flat" }))} style={{ ...inputStyle(), appearance: "none" }}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat amount (₹)</option>
                </select>
              ))}
              {field(editing.type === "flat" ? "Amount (₹)" : "Percentage (%)", <input type="number" min="0" max={editing.type === "flat" ? 1_000_000 : 100} step="0.01" value={editing.value ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, value: e.target.value }))} placeholder={editing.type === "flat" ? "e.g. 50" : "e.g. 10"} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Min order value (₹)", <input type="number" min="0" value={editing.minOrderValue ?? "0"} onChange={(e) => setEditing((d) => ({ ...d!, minOrderValue: e.target.value }))} style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
              {field("Max discount cap (₹, optional)", <input type="number" min="0" value={editing.maxDiscountAmount ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, maxDiscountAmount: e.target.value || null }))} placeholder="No cap" style={inputStyle({ fontFamily: "var(--font-mono)" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
            </div>
            {field("Coupon code (optional)", <input value={editing.code ?? ""} onChange={(e) => setEditing((d) => ({ ...d!, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))} placeholder="e.g. HAPPY10 — leave blank for staff-applied only" maxLength={20} style={inputStyle({ fontFamily: "var(--font-mono)", letterSpacing: ".05em" })} onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")} onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-line-strong)")} />)}
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

// ── Reservations tab ─────────────────────────────────────────────────────────
type Reservation = { id: string; customerName: string; customerPhone: string | null; partySize: number; reservedFor: string; tableId: string | null; status: string; notes: string | null; table?: { name: string } | null }

function ReservationsTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [slideOpen, setSlideOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Reservation> | null>(null)
  const [form, setForm] = useState({ customerName: "", customerPhone: "", partySize: 2, reservedFor: "", tableId: "", notes: "", status: "pending" })
  const [error, setError] = useState("")

  const { data: tables = [] } = useQuery<{ id: string; name: string; capacity: number }[]>({
    queryKey: ["tables-list-for-res"],
    queryFn: async () => {
      const r = await api.tables.getAll() as { tables: { id: string; name: string; capacity: number }[] }
      return r.tables
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["reservations", date],
    queryFn: () => api.queue.listReservations(date) as Promise<Reservation[]>,
  })

  // Reservations changed on another terminal (or seated from here) update live
  useEffect(() => {
    const unsub = ws.on("reservation.updated", () => {
      qc.invalidateQueries({ queryKey: ["reservations"] })
    })
    return unsub
  }, [qc])

  // Guest arrived — seat the reservation: links the customer, marks the table
  // reserved on the floor, and the next order on that table inherits the guest.
  const seatMutation = useMutation({
    mutationFn: (id: string) => api.queue.seatReservation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] })
      qc.invalidateQueries({ queryKey: ["tables"] })
    },
    onError: (e: Error) => alert(e.message || "Could not seat reservation"),
  })

  function openCreate() {
    setEditing(null)
    setForm({ customerName: "", customerPhone: "", partySize: 2, reservedFor: `${date}T19:00`, tableId: "", notes: "", status: "pending" })
    setError("")
    setSlideOpen(true)
  }

  function openEdit(r: Reservation) {
    setEditing(r)
    setForm({
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? "",
      partySize: r.partySize,
      reservedFor: r.reservedFor.slice(0, 16),
      tableId: r.tableId ?? "",
      notes: r.notes ?? "",
      status: r.status,
    })
    setError("")
    setSlideOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || null,
        partySize: form.partySize,
        reservedFor: new Date(form.reservedFor).toISOString(),
        tableId: form.tableId || null,
        notes: form.notes.trim() || null,
        status: form.status,
      }
      if (editing?.id) return api.queue.updateReservation(editing.id, payload)
      return api.queue.createReservation(payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reservations"] }); setSlideOpen(false) },
    onError: (e: Error) => setError(e.message ?? "Failed to save"),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.queue.deleteReservation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  })

  const STATUS_COLOR: Record<string, string> = { pending: "amber", confirmed: "blue", seated: "green", no_show: "red", cancelled: "red" }
  const slots: string[] = []
  for (let h = 9; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`)
    if (h < 23) slots.push(`${String(h).padStart(2, "0")}:30`)
  }

  function resForSlot(slot: string) {
    return reservations.filter((r) => r.reservedFor.slice(11, 16) === slot && r.status !== "cancelled")
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Reservations</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13 }}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, cursor: "pointer" }}
          >← Prev</button>
          <button onClick={() => setDate(today)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: date === today ? "var(--color-ink)" : "var(--color-bg)", color: date === today ? "var(--color-bg)" : "var(--color-ink)", fontSize: 13, cursor: "pointer" }}>Today</button>
          <button
            onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", color: "var(--color-ink)", fontSize: 13, cursor: "pointer" }}
          >Next →</button>
          <button onClick={openCreate} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New Reservation</button>
        </div>
      </div>

      {/* Timeline */}
      <div className="scroll" style={{ flex: 1, padding: "16px 24px" }}>
        {isLoading ? (
          <div style={{ color: "var(--color-ink-3)", fontSize: 14, padding: 40, textAlign: "center" }}>Loading…</div>
        ) : (
          slots.map((slot) => {
            const slotRes = resForSlot(slot)
            if (slotRes.length === 0 && slot.endsWith(":30")) return null
            return (
              <div key={slot} style={{ display: "flex", gap: 12, marginBottom: 4, alignItems: "flex-start" }}>
                <div style={{ width: 52, flexShrink: 0, fontSize: 11, fontFamily: "var(--font-mono)", color: slotRes.length > 0 ? "var(--color-ink-2)" : "var(--color-ink-4)", paddingTop: 8, textAlign: "right" }}>{slot}</div>
                <div style={{ flex: 1, borderTop: "1px solid var(--color-line)", paddingTop: 6, paddingBottom: 6, minHeight: 32 }}>
                  {slotRes.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => openEdit(r)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 8, padding: "5px 10px", marginRight: 8, marginBottom: 4, cursor: "pointer", fontSize: 13 }}
                    >
                      <span className={`dot ${STATUS_COLOR[r.status] ?? "amber"}`} />
                      <span style={{ fontWeight: 600 }}>{r.customerName}</span>
                      <span style={{ color: "var(--color-ink-3)" }}>{r.partySize}p</span>
                      {r.table && <span style={{ color: "var(--color-ink-3)" }}>· {r.table.name}</span>}
                      <span className={`badge ${STATUS_COLOR[r.status] ?? "amber"}`} style={{ fontSize: 10 }}>{r.status}</span>
                      {(r.status === "pending" || r.status === "confirmed") && (
                        // Guest arrived — one tap seats them and reserves the table on the floor
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!r.tableId) { alert("Assign a table to this reservation first (tap to edit)"); return }
                            seatMutation.mutate(r.id)
                          }}
                          title={r.tableId ? "Guest arrived — seat at the reserved table" : "Assign a table first"}
                          style={{ fontSize: 11, fontWeight: 600, color: "var(--color-green)", border: "1px solid var(--color-line-strong)", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}
                        >
                          Seat
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Slide panel */}
      {slideOpen && (
        <SlidePanel title={editing ? "Edit Reservation" : "New Reservation"} onClose={() => setSlideOpen(false)} footer={
          <>
            <CancelBtn onClose={() => setSlideOpen(false)} />
            {editing && (
              <button
                onClick={() => { if (editing.id) { cancelMutation.mutate(editing.id); setSlideOpen(false) } }}
                style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-line-strong)", background: "transparent", color: "var(--color-red)", fontSize: 13, cursor: "pointer" }}
              >Cancel Reservation</button>
            )}
            <button
              onClick={() => { if (!form.customerName.trim()) { setError("Name is required"); return } if (!form.reservedFor) { setError("Time is required"); return } saveMutation.mutate() }}
              disabled={saveMutation.isPending}
              style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saveMutation.isPending ? 0.6 : 1 }}
            >{saveMutation.isPending ? "Saving…" : "Save"}</button>
          </>
        }>
          {field("Customer name *", <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} maxLength={100} style={inputStyle()} placeholder="e.g. Priya Sharma" />)}
          {field("Phone (optional)", <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} inputMode="numeric" maxLength={10} style={inputStyle()} placeholder="e.g. 9876543210" />)}
          {field("Party size", (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setForm((f) => ({ ...f, partySize: Math.max(1, f.partySize - 1) }))} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer" }}>−</button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: "center" }}>{form.partySize}</span>
              <button onClick={() => setForm((f) => ({ ...f, partySize: Math.min(50, f.partySize + 1) }))} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-bg)", fontSize: 18, cursor: "pointer" }}>+</button>
            </div>
          ))}
          {field("Date & time *", <input type="datetime-local" value={form.reservedFor} onChange={(e) => setForm((f) => ({ ...f, reservedFor: e.target.value }))} style={inputStyle()} />)}
          {field("Table (optional)", (
            <select value={form.tableId} onChange={(e) => setForm((f) => ({ ...f, tableId: e.target.value }))} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="">No specific table</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.capacity} seats)</option>)}
            </select>
          ))}
          {editing && field("Status", (
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={{ ...inputStyle(), appearance: "none" }}>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="seated">Seated</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ))}
          {field("Notes", <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} maxLength={500} style={{ ...inputStyle({ height: "auto", padding: "10px 14px", resize: "vertical" }), lineHeight: 1.5 }} placeholder="e.g. window seat, anniversary" />)}
          {error && <div style={{ fontSize: 12, color: "var(--color-red)" }}>{error}</div>}
        </SlidePanel>
      )}
    </div>
  )
}

// ── Setup checklist ──────────────────────────────────────────────────────────
function SetupChecklist({ onNavigate }: { onNavigate: (tab: NavId) => void }) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("inbill_setup_dismissed") === "1")
  const { data: menu } = useQuery({ queryKey: ["menu"], queryFn: () => api.menu.getAll() as Promise<{ categories: unknown[]; items: unknown[] }> })
  const { data: tablesData } = useQuery({ queryKey: ["tables"], queryFn: () => api.tables.getAll() as Promise<{ tables: unknown[] }> })
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => api.users.getAll() as Promise<unknown[]> })
  const { data: outlet } = useQuery({ queryKey: ["outlet"], queryFn: () => api.outlet.get() })

  const hasMenu = (menu?.items?.length ?? 0) > 0
  const tablesEnabled = outlet?.settings?.hasTables !== false
  const hasTables = !tablesEnabled || (tablesData?.tables?.length ?? 0) > 0
  const hasStaff = (users?.length ?? 0) > 0

  const steps: { label: string; done: boolean; tab: NavId }[] = [
    ...(tablesEnabled ? [{ label: "Configure tables", done: hasTables, tab: "tables" as NavId }] : []),
    { label: "Add menu items", done: hasMenu, tab: "menu" },
    { label: "Add staff", done: hasStaff, tab: "staff" },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length
  const canStart = hasTables && hasMenu

  if (dismissed) return null

  return (
    <div style={{ margin: "12px 0 4px", padding: "14px 14px 10px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-surface-2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink-3)", letterSpacing: ".05em", textTransform: "uppercase" }}>
          {allDone ? "All set!" : `Setup · ${doneCount}/${steps.length}`}
        </div>
        <button onClick={() => { setDismissed(true); localStorage.setItem("inbill_setup_dismissed", "1") }} style={{ background: "none", border: "none", color: "var(--color-ink-4)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
      </div>
      <div style={{ height: 3, background: "var(--color-line-strong)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(doneCount / steps.length) * 100}%`, background: "var(--color-green)", borderRadius: 2, transition: "width .3s" }} />
      </div>
      {steps.map((step) => (
        <div key={step.label} onClick={() => !step.done && onNavigate(step.tab)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: step.done ? "default" : "pointer" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: step.done ? "var(--color-green)" : "transparent", border: step.done ? "none" : "1.5px solid var(--color-line-strong)" }}>
            {step.done && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <span style={{ fontSize: 12, color: step.done ? "var(--color-ink-3)" : "var(--color-ink-2)", textDecoration: step.done ? "line-through" : "none", fontWeight: step.done ? 400 : 500 }}>{step.label}</span>
        </div>
      ))}
      {canStart && (
        <button
          onClick={() => { localStorage.setItem("inbill_setup_dismissed", "1"); navigate({ to: "/floor" }) }}
          style={{ marginTop: 10, width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
        >
          Start taking orders →
        </button>
      )}
    </div>
  )
}

// ── Loyalty tab ──────────────────────────────────────────────────────────────
function LoyaltyTab() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  type LoyaltyConfig = { id: string; pointsPerRupee: string; redeemRate: string; minRedeemPoints: number; isActive: boolean } | null
  type TopCustomer = { id: string; customerId: string; totalPoints: number; lifetimePoints: number; tier: string; customer: { id: string; name?: string | null; phone: string } | null }

  const { data: config, isLoading } = useQuery({ queryKey: ["loyalty-config"], queryFn: () => api.loyalty.getConfig() as Promise<LoyaltyConfig> })
  const { data: topCustomers = [] } = useQuery({ queryKey: ["loyalty-top"], queryFn: () => api.loyalty.topCustomers(20) as Promise<TopCustomer[]> })

  const [pointsPerRupee, setPointsPerRupee] = useState("")
  const [redeemRate,     setRedeemRate]     = useState("")
  const [minPoints,      setMinPoints]      = useState("")
  const [isActive,       setIsActive]       = useState(true)

  useEffect(() => {
    if (config) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setPointsPerRupee(config.pointsPerRupee)
      setRedeemRate(config.redeemRate)
      setMinPoints(String(config.minRedeemPoints))
      setIsActive(config.isActive)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: () => api.loyalty.saveConfig({
      pointsPerRupee: parseFloat(pointsPerRupee) || 1,
      redeemRate:     parseFloat(redeemRate)     || 100,
      minRedeemPoints: parseInt(minPoints, 10)   || 100,
      isActive,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty-config"] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  const TIER_COLOR: Record<string, string> = { bronze: "#cd7f32", silver: "#aaa", gold: "#f59e0b" }

  if (isLoading) return <div style={{ padding: 40, color: "var(--color-ink-3)" }}>Loading…</div>

  return (
    <>
      <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid var(--color-line)" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Loyalty Program</h3>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 4 }}>Earn & redeem points on every bill</div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Config card */}
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Settings</div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: "var(--color-ink-2)" }}>{isActive ? "Active" : "Disabled"}</span>
              <div onClick={() => setIsActive((v) => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: isActive ? "var(--color-green)" : "var(--color-line-strong)", position: "relative", cursor: "pointer", transition: "background .15s" }}>
                <div style={{ position: "absolute", top: 3, left: isActive ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
              </div>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {([
              { label: "Points per ₹1 spent", value: pointsPerRupee, set: setPointsPerRupee, hint: "e.g. 1 = earn 1 pt per ₹1", min: "0.01", max: "10", step: "0.01" },
              { label: "Points per ₹1 off", value: redeemRate, set: setRedeemRate, hint: "e.g. 100 = 100 pts = ₹1", min: "1", max: "10000", step: "1" },
              { label: "Min points to redeem", value: minPoints, set: setMinPoints, hint: "Minimum before redeem allowed", min: "1", max: "100000", step: "1" },
            ] as const).map(({ label, value, set, hint, min, max, step }) => (
              <div key={label}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", display: "block", marginBottom: 6 }}>{label}</label>
                <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => set(e.target.value)} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line-strong)", padding: "0 12px", fontSize: 14, background: "var(--color-bg)", color: "var(--color-ink)", outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 11, color: "var(--color-ink-4)", marginTop: 4 }}>{hint}</div>
              </div>
            ))}
          </div>

          {pointsPerRupee && redeemRate && (
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", background: "var(--color-surface-2)", borderRadius: 10, padding: "10px 14px" }}>
              Example: ₹500 bill earns <b style={{ color: "var(--color-ink)" }}>{Math.floor(500 * parseFloat(pointsPerRupee) || 0)} pts</b> · {Math.floor(500 * parseFloat(pointsPerRupee) || 0)} pts = <b style={{ color: "var(--color-ink)" }}>₹{(Math.floor(500 * parseFloat(pointsPerRupee) || 0) / parseFloat(redeemRate)).toFixed(2)} off</b>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", opacity: saveMutation.isPending ? .6 : 1 }}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span style={{ fontSize: 13, color: "var(--color-green)" }}>Saved ✓</span>}
          </div>
        </div>

        {/* Top customers */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Top Customers by Lifetime Points</div>
          {topCustomers.length === 0 ? (
            <div style={{ color: "var(--color-ink-3)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>No loyalty data yet — points are awarded automatically when bills are paid.</div>
          ) : (
            <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 100px 100px 80px", padding: "10px 16px", background: "var(--color-surface-2)", fontSize: 11, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                <span>#</span><span>Customer</span><span style={{ textAlign: "right" }}>Points</span><span style={{ textAlign: "right" }}>Lifetime</span><span style={{ textAlign: "center" }}>Tier</span>
              </div>
              {topCustomers.map((row, i) => (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 100px 100px 80px", padding: "12px 16px", borderTop: "1px solid var(--color-line)", fontSize: 13, alignItems: "center" }}>
                  <span style={{ color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>{i + 1}</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{row.customer?.name ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>{row.customer?.phone}</div>
                  </div>
                  <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{row.totalPoints.toLocaleString()}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-ink-3)" }}>{row.lifetimePoints.toLocaleString()}</span>
                  <span style={{ textAlign: "center", fontSize: 11, fontWeight: 700, textTransform: "capitalize", color: TIER_COLOR[row.tier] ?? "var(--color-ink-3)" }}>{row.tier}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Home tab ─────────────────────────────────────────────────────────────────
function HomeTab({ navigate }: { navigate: (tab: NavId) => void }) {
  const user = useAuthStore((s) => s.user)

  const todayFrom = new Date()
  todayFrom.setHours(0, 0, 0, 0)
  const todayTo   = new Date()
  const fromStr   = todayFrom.toISOString().split("T")[0]!
  const toStr     = todayTo.toISOString().split("T")[0]!

  const { data: summary } = useQuery({
    queryKey: ["report-summary-home", fromStr],
    queryFn: () => api.reports.summary(fromStr, toStr) as Promise<ReportSummary>,
    refetchInterval: 60_000,
  })
  const { data: lowStockData } = useQuery<{ count: number }>({
    queryKey: ["low-stock-count"],
    queryFn: () => api.inventory.lowStockCount(),
    refetchInterval: 60_000,
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const kpiCards = [
    { label: "Revenue today", value: summary ? formatCurrency(summary.totalRevenue) : "—", sub: `${summary?.billCount ?? 0} bills`, forest: true },
    { label: "Avg ticket", value: summary && summary.billCount > 0 ? formatCurrency(summary.totalRevenue / summary.billCount) : "—", sub: "per bill" },
    { label: "Tax collected", value: summary ? formatCurrency(summary.totalTax) : "—", sub: "CGST + SGST" },
    { label: "Discounts", value: summary ? formatCurrency(summary.totalDiscount) : "—", sub: "applied today" },
  ]

  const sections: { id: NavId; label: string; sub: string; kpi: string; tag?: string; tone?: string }[] = [
    { id: "menu",      label: "Catalog",    sub: "Menu, modifiers, discounts, tax", kpi: "Manage what you sell" },
    { id: "staff",     label: "People",     sub: "Staff, customers, loyalty",       kpi: "Manage who works here" },
    { id: "shifts",    label: "Finance",    sub: "Reports, expenses",               kpi: "Revenue & cost tracking" },
    { id: "tables",    label: "Setup",      sub: "Tables, outlet, devices",         kpi: "Outlet configuration",
      tag: lowStockData?.count ? `${lowStockData.count} low stock` : undefined, tone: "red" },
    { id: "outlet",    label: "Outlet",     sub: "Name, GSTIN, branding",           kpi: "Business info & compliance" },
    { id: "reservations", label: "Reservations", sub: "Upcoming bookings",          kpi: "Table reservations" },
  ]

  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Greeting */}
      <div>
        <h1 className="display" style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: "-.02em" }}>
          {greeting}, {user?.name?.split(" ")[0] ?? "there"}.
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-ink-3)" }}>{dateLabel}</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCards.map((kpi, i) => (
          <div key={i} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div className="eyebrow">{kpi.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 600, marginTop: 6, color: kpi.forest ? "var(--color-green)" : "var(--color-ink)" }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-ink-4)", marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Section cards */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Quick access</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {sections.map((s) => (
            <article key={s.id} onClick={() => navigate(s.id)} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 18, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>{s.sub}</div>
                </div>
                {s.tag && <span className={`badge ${s.tone ?? ""}`} style={{ fontSize: 10 }}>{s.tag}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-ink-2)", borderTop: "1px solid var(--color-line)", paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 500 }}>
                {s.kpi} <span style={{ color: "var(--color-ink-4)" }}>→</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Payment mode breakdown */}
      {summary && Object.keys(summary.byPaymentMode).length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Payment mix · today</div>
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {Object.entries(summary.byPaymentMode).map(([mode, amount]) => (
              <div key={mode}>
                <div style={{ fontSize: 11, color: "var(--color-ink-3)", textTransform: "capitalize", fontWeight: 500 }}>{mode}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600, marginTop: 2 }}>{formatCurrency(amount as number)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Billing & plan ────────────────────────────────────────────────────────────
function BillingTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: api.billing.getSubscription,
    retry: false,
  })

  const plan = data?.plan ?? "free"
  const isPaid = plan !== "free" && plan !== "self_hosted"
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
      <div style={{ maxWidth: 560, border: "1px solid var(--color-line)", borderRadius: 14, background: "var(--color-surface)", padding: 24 }}>
        <div style={{ fontSize: 12, color: "var(--color-ink-3)", fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>Current plan</div>

        {isLoading ? (
          <div style={{ color: "var(--color-ink-3)", fontSize: 14, marginTop: 12 }}>Loading…</div>
        ) : data?.selfHosted ? (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: "var(--color-ink)" }}>Self-hosted</div>
            <p style={{ fontSize: 14, color: "var(--color-ink-2)", marginTop: 10, lineHeight: 1.5 }}>
              You&apos;re running the open-source build — every feature is unlocked and there&apos;s nothing to pay.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: "var(--color-ink)" }}>
              {cap(plan)}
              {data?.cycle ? <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink-3)" }}> · {data.cycle}</span> : null}
            </div>
            {isPaid && data?.status && data.status !== "active" && (
              <div style={{ fontSize: 13, color: "#b45309", marginTop: 6, textTransform: "capitalize" }}>Status: {data.status}</div>
            )}
            {data?.currentPeriodEnd && (
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 6 }}>
                {data.cancelAtPeriodEnd ? "Access ends" : "Renews"} on {fmtDate(data.currentPeriodEnd)}
              </div>
            )}
            <p style={{ fontSize: 14, color: "var(--color-ink-2)", marginTop: 12, lineHeight: 1.5 }}>
              {isPaid
                ? "Manage your subscription, switch plans or cancel on the InBill site."
                : "You're on the free plan. Upgrade to unlock hosted backups, aggregator sync, kitchen stations, multi-outlet and more."}
            </p>
            {isError && (
              <p style={{ fontSize: 12.5, color: "var(--color-ink-3)", marginTop: 8 }}>
                Sign in as the account owner to see live plan details.
              </p>
            )}
          </>
        )}

        {!data?.selfHosted && (
          <a
            href={billingUrl()}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 18, padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            {isPaid ? "Manage plan →" : "Upgrade →"}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Nav sidebar ──────────────────────────────────────────────────────────────
type NavGroup = { label: string; ownerOnly?: boolean; items: { id: NavId; label: string }[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Catalog",
    items: [
      { id: "menu",      label: "Menu" },
      { id: "modifiers", label: "Modifiers" },
      { id: "discounts", label: "Discounts" },
      { id: "schedules", label: "Schedules" },
      { id: "stations",  label: "Kitchen Stations" },
      { id: "taxes",     label: "Tax & Charges" },
    ],
  },
  {
    label: "People",
    items: [
      { id: "staff",     label: "Staff & PINs" },
      { id: "customers", label: "Customers" },
      { id: "loyalty",   label: "Loyalty" },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "shifts",   label: "Reports" },
      { id: "bills",    label: "Bill History" },
      { id: "dayclose", label: "Day Close" },
      { id: "expenses", label: "Expenses" },
      { id: "activity", label: "Activity Log" },
    ],
  },
  {
    label: "Setup",
    ownerOnly: false,
    items: [
      { id: "outlet",       label: "Outlet Settings" },
      { id: "tables",       label: "Tables" },
      { id: "devices",      label: "Devices" },
      { id: "reservations", label: "Reservations" },
      { id: "billing",      label: "Billing & Plan" },
    ],
  },
]

const NAV_ICONS: Partial<Record<NavId, React.ReactElement>> = {
  home:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  staff:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><path d="M16 4a3.5 3.5 0 010 7M22 20c0-2.7-1.7-5-4.5-5.7"/></svg>,
  menu:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>,
  modifiers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>,
  tables:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>,
  taxes:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M5 10v.01M19 15v.01"/></svg>,
  discounts: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>,
  shifts:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  bills:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1z"/><path d="M9 8h6M9 12h6"/></svg>,
  dayclose:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/></svg>,
  activity:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 8-6-16-3 8H2"/></svg>,
  schedules: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/><path d="M5 2L2 5M19 2l3 3"/></svg>,
  stations:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M20 20V10"/><path d="M2 10l10-6 10 6"/><path d="M8 20v-5h8v5"/><path d="M12 4v2"/></svg>,
  customers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  loyalty:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  expenses:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  outlet:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  devices:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5a10 10 0 0114 0M8 16a6 6 0 018 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
  reservations: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>,
  billing:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
}

const VALID_TABS = new Set<NavId>(["home", "staff", "menu", "tables", "taxes", "modifiers", "discounts", "schedules", "stations", "shifts", "bills", "dayclose", "activity", "customers", "loyalty", "reservations", "expenses", "outlet", "devices", "billing"])

// ── Main page ────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const navigate    = useNavigate()
  const user        = useAuthStore((s) => s.user)
  const { outletName } = useAuthStore()
  const isTablet = useIsTablet()
  const isMobile = useIsMobile()
  const stationsLocked = !isUsable(useFeature("kitchen_stations"))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NavId>(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as NavId | null
    return t && VALID_TABS.has(t) ? t : "home"
  })
  // On tablet/mobile the sidebar is an off-canvas drawer — picking a tab closes it.
  function selectTab(tab: NavId) {
    setActiveTab(tab)
    if (isTablet) setDrawerOpen(false)
  }

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--color-bg)", position: "relative" }}>
      {isTablet && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} className="animate-overlay-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 40 }} />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      {(!isTablet || drawerOpen) && (
        <aside
          className={isTablet ? "animate-slide-left" : undefined}
          style={{
            width: 224, flexShrink: 0, borderRight: "1px solid var(--color-line)", background: "var(--color-surface)", display: "flex", flexDirection: "column", padding: "16px 10px",
            ...(isTablet ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50, boxShadow: "12px 0 40px rgba(0,0,0,.12)" } : {}),
          }}
        >
        {/* Logo + outlet */}
        <div style={{ padding: "0 6px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "var(--color-ink)", flexShrink: 0 }}>
            <LogoMark size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{outletName ?? "inbill"}</div>
          </div>
          {isTablet && (
            <button onClick={() => setDrawerOpen(false)} style={{ background: "transparent", border: "none", color: "var(--color-ink-3)", cursor: "pointer", padding: 4, borderRadius: 8, display: "flex", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>

        {/* Floor shortcut */}
        <div onClick={() => navigate({ to: "/floor" })} style={{ padding: "8px 10px", borderRadius: 7, marginBottom: 2, display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)"}
          onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
          Floor
        </div>

        {/* Home */}
        <div onClick={() => selectTab("home")} style={{ padding: "8px 10px", borderRadius: 7, marginBottom: 10, display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: activeTab === "home" ? 600 : 500, color: activeTab === "home" ? "var(--color-ink)" : "var(--color-ink-2)", background: activeTab === "home" ? "var(--color-surface-2)" : "transparent", cursor: "pointer" }}
          onMouseEnter={(e) => { if (activeTab !== "home") (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)" }}
          onMouseLeave={(e) => { if (activeTab !== "home") (e.currentTarget as HTMLDivElement).style.background = "transparent" }}>
          {NAV_ICONS.home}
          Home
        </div>

        {/* Grouped nav */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div className="eyebrow" style={{ padding: "0 10px", marginBottom: 4 }}>{group.label}</div>
              {group.items.map((item) => {
                const active = activeTab === item.id
                return (
                  <div key={item.id} onClick={() => selectTab(item.id)} style={{ padding: "8px 10px", borderRadius: 7, marginBottom: 1, display: "flex", alignItems: "center", gap: 9, background: active ? "var(--color-surface-2)" : "transparent", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "var(--color-ink)" : "var(--color-ink-2)", cursor: "pointer" }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "var(--color-hover)" }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent" }}>
                    {NAV_ICONS[item.id]}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.id === "stations" && stationsLocked && <LockBadge />}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* User + setup checklist */}
        <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 10 }}>
          <SetupChecklist onNavigate={selectTab} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 8px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
              {initials(user?.name ?? "?")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
              <div style={{ fontSize: 10, color: "var(--color-ink-3)", textTransform: "capitalize" }}>{user?.role}</div>
            </div>
          </div>
        </div>
        </aside>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* Content header */}
        <div style={{ height: 52, flexShrink: 0, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: isMobile ? "0 12px" : "0 28px", gap: isMobile ? 8 : 14 }}>
          {isTablet && (
            <button onClick={() => setDrawerOpen(true)} title="Menu" style={{ background: "transparent", border: "1px solid var(--color-line)", color: "var(--color-ink-2)", width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          )}
          <span style={{ fontSize: 13, color: "var(--color-ink-3)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {activeTab === "home" ? "Home" : NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? activeTab}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate({ to: "/floor" })} title="Floor" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "0" : "7px 12px", width: isMobile ? 32 : undefined, height: isMobile ? 32 : undefined, justifyContent: "center", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: "var(--color-ink-2)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
            {!isMobile && "Floor"}
          </button>
          <button onClick={() => navigate({ to: "/kds" })} title="Kitchen" style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "0" : "7px 12px", width: isMobile ? 32 : undefined, height: isMobile ? 32 : undefined, justifyContent: "center", borderRadius: 8, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 12, fontFamily: "inherit", color: "var(--color-ink-2)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18"/><path d="M9 17v3M15 17v3M6 20h12"/></svg>
            {!isMobile && "Kitchen"}
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {activeTab === "home"      && <HomeTab navigate={setActiveTab} />}
          {activeTab === "staff"     && <StaffTab />}
          {activeTab === "menu"      && <MenuTab />}
          {activeTab === "modifiers" && <ModifiersTab />}
          {activeTab === "tables"    && <TablesTab />}
          {activeTab === "taxes"     && <TaxTab />}
          {activeTab === "discounts" && <DiscountsTab />}
          {activeTab === "shifts"    && <ShiftsTab />}
          {activeTab === "bills"     && <BillsTab />}
          {activeTab === "dayclose"  && <DayCloseTab />}
          {activeTab === "activity"  && <ActivityTab />}
          {activeTab === "schedules" && <SchedulesTab />}
          {activeTab === "stations"  && <StationsTab />}
          {activeTab === "customers" && <CustomersTab />}
          {activeTab === "loyalty"       && <LoyaltyTab />}
          {activeTab === "reservations"  && <ReservationsTab />}
          {activeTab === "expenses"      && <ExpensesTab />}
          {activeTab === "outlet"    && <OutletTab />}
          {activeTab === "devices"   && <DevicesTab />}
          {activeTab === "billing"   && <BillingTab />}
        </div>
      </div>
    </div>
  )
}
