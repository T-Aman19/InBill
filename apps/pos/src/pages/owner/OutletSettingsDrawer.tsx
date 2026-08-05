import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type MenuSchedule, type OwnerOutlet } from "@/lib/api"
import type { TaxConfig } from "@inbill/shared"

// Index-aligned with the stored `days` numbers (0 = Sunday, matching Date#getDay()) —
// must match ManagerPage.tsx's DAY_LABELS so a schedule reads the same in both places.
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"]

type Tab = "general" | "tax" | "schedules" | "payment"
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0116 0v1" /></svg> },
  { id: "tax", label: "Tax & charges", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg> },
  { id: "schedules", label: "Schedules", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg> },
  { id: "payment", label: "Payment methods", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg> },
]

const inputStyle: React.CSSProperties = {
  // minWidth: 0 overrides the browser's intrinsic min-content width on <input>
  // (~size=20 worth of chars) — without it, a 2-3 column grid of inputs forces
  // its track wider than 1fr and blows out the fixed-width drawer.
  width: "100%", minWidth: 0, height: 38, border: "1px solid var(--color-line-strong)", borderRadius: 9, padding: "0 12px",
  fontSize: 13, fontFamily: "inherit", background: "var(--color-surface)", color: "var(--color-ink)", outline: "none",
}
const label: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }
const iconBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink-3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }

export function OutletSettingsDrawer({ outlet, onClose }: { outlet: OwnerOutlet; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("general")

  return (
    <>
      <div onClick={onClose} className="animate-overlay-in" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 60 }} />
      <div
        className="animate-slide-right"
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "92vw", zIndex: 61, background: "var(--color-surface)", boxShadow: "var(--shadow-3)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px", borderBottom: "1px solid var(--color-line)", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="eyebrow">Outlet settings</span>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, margin: "3px 0 0" }}>{outlet.name}</h2>
          </div>
          <button onClick={onClose} title="Close" style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "1px solid var(--color-line)", color: "var(--color-ink-3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
          <nav style={{ width: 168, flexShrink: 0, borderRight: "1px solid var(--color-line)", padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2 }} className="scroll">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 8, border: "none",
                  fontSize: 13, fontWeight: t.id === tab ? 600 : 500, textAlign: "left", cursor: "pointer",
                  background: t.id === tab ? "var(--color-accent-soft)" : "transparent",
                  color: t.id === tab ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                }}
              >
                <span style={{ opacity: 0.85, flexShrink: 0, display: "flex" }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", minWidth: 0 }}>
            {tab === "general" && <GeneralPane outlet={outlet} />}
            {tab === "tax" && <TaxPane outletId={outlet.id} />}
            {tab === "schedules" && <SchedulesPane outletId={outlet.id} />}
            {tab === "payment" && <PaymentPane outlet={outlet} />}
          </div>
        </div>
      </div>
    </>
  )
}

function PaneHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 16, lineHeight: 1.5 }}>{sub}</p>
    </>
  )
}

function GeneralPane({ outlet }: { outlet: OwnerOutlet }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: outlet.name, address: outlet.address, phone: outlet.phone, gstin: outlet.gstin ?? "" })
  const [saved, setSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.owner.updateOutlet(outlet.id, { name: form.name.trim(), address: form.address.trim(), phone: form.phone, gstin: form.gstin || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner-outlets"] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  return (
    <div>
      <PaneHeading title="Outlet details" sub="Shown on receipts and used for GST filing." />
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Outlet name</label>
        <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Address</label>
        <input style={inputStyle} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} maxLength={500} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={label}>Phone</label>
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} inputMode="numeric" />
        </div>
        <div>
          <label style={label}>GSTIN</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().slice(0, 15) }))} />
        </div>
      </div>
      {outlet.setupCode && (
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Device setup code</label>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: ".08em", border: "1px solid var(--color-line)", borderRadius: 9, padding: "9px 12px", color: "var(--color-ink-2)" }}>{outlet.setupCode}</div>
        </div>
      )}
      <button type="button" className="btn primary" disabled={mutation.isPending} onClick={() => mutation.mutate()} style={{ marginTop: 4 }}>
        {mutation.isPending ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
      </button>
    </div>
  )
}

function TaxPane({ outletId }: { outletId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["outlet-tax", outletId], queryFn: () => api.owner.outletTax(outletId) })
  const [form, setForm] = useState({ name: "Standard GST", cgstRate: "2.5", sgstRate: "2.5", igstRate: "0" })

  useEffect(() => {
    if (data) setForm({ name: data.name, cgstRate: String(data.cgstRate), sgstRate: String(data.sgstRate), igstRate: String(data.igstRate) })
  }, [data])

  const mutation = useMutation({
    mutationFn: () => api.owner.saveOutletTax(outletId, { name: form.name.trim() || "Default", cgstRate: parseFloat(form.cgstRate) || 0, sgstRate: parseFloat(form.sgstRate) || 0, igstRate: parseFloat(form.igstRate) || 0 }),
    onSuccess: (updated: TaxConfig) => { qc.setQueryData(["outlet-tax", outletId], updated) },
  })

  const combined = (parseFloat(form.cgstRate) || 0) + (parseFloat(form.sgstRate) || 0)
  const canSave = form.name.trim().length > 0 && combined <= 50

  if (isLoading) return <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Loading…</p>

  return (
    <div>
      <PaneHeading title="Tax config" sub="Applied to menu items at billing. CGST + SGST for intra-state, IGST for inter-state." />
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Name</label>
        <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
        <div>
          <label style={label}>CGST %</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} type="number" min="0" max="50" step="0.1" value={form.cgstRate} onChange={(e) => setForm((f) => ({ ...f, cgstRate: e.target.value }))} />
        </div>
        <div>
          <label style={label}>SGST %</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} type="number" min="0" max="50" step="0.1" value={form.sgstRate} onChange={(e) => setForm((f) => ({ ...f, sgstRate: e.target.value }))} />
        </div>
        <div>
          <label style={label}>IGST %</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} type="number" min="0" max="50" step="0.1" value={form.igstRate} onChange={(e) => setForm((f) => ({ ...f, igstRate: e.target.value }))} />
        </div>
      </div>
      {combined > 50 && <p style={{ fontSize: 12, color: "var(--color-red)", marginBottom: 12 }}>Combined CGST + SGST cannot exceed 50%.</p>}
      <button type="button" className="btn primary" disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()} style={{ marginTop: 6 }}>
        {mutation.isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  )
}

type ScheduleDraft = { id?: string; name: string; days: number[]; startTime: string; endTime: string; percentOff: string }
const BLANK_SCHEDULE: ScheduleDraft = { name: "", days: [], startTime: "09:00", endTime: "23:00", percentOff: "0" }

function SchedulesPane({ outletId }: { outletId: string }) {
  const qc = useQueryClient()
  const { data: schedules = [], isLoading } = useQuery({ queryKey: ["outlet-schedules", outletId], queryFn: () => api.owner.outletSchedules(outletId) })
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ["outlet-schedules", outletId] })
  const createMutation = useMutation({
    mutationFn: (d: ScheduleDraft) => api.owner.createOutletSchedule(outletId, { name: d.name.trim(), days: d.days, startTime: d.startTime, endTime: d.endTime, percentOff: parseFloat(d.percentOff) || 0 }),
    onSuccess: () => { invalidate(); setDraft(null) },
  })
  const updateMutation = useMutation({
    mutationFn: (d: ScheduleDraft) => api.owner.updateOutletSchedule(outletId, d.id!, { name: d.name.trim(), days: d.days, startTime: d.startTime, endTime: d.endTime, percentOff: parseFloat(d.percentOff) || 0 }),
    onSuccess: () => { invalidate(); setDraft(null) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.owner.deleteOutletSchedule(outletId, id),
    onSuccess: invalidate,
  })

  const saving = createMutation.isPending || updateMutation.isPending
  const canSave = !!draft && draft.name.trim().length > 0 && draft.startTime && draft.endTime

  if (isLoading) return <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Loading…</p>

  return (
    <div>
      <PaneHeading title="Availability schedules" sub="Restrict menu categories to a time window, with an optional happy-hour discount." />

      {draft ? (
        <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Name</label>
            <input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Breakfast, Happy Hour" maxLength={100} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Days <span style={{ color: "var(--color-ink-3)", fontWeight: 400 }}>(none = every day)</span></label>
            <div style={{ display: "flex", gap: 5 }}>
              {DAY_LABELS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraft({ ...draft, days: draft.days.includes(i) ? draft.days.filter((x) => x !== i) : [...draft.days, i].sort() })}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${draft.days.includes(i) ? "var(--color-ink)" : "var(--color-line)"}`, background: draft.days.includes(i) ? "var(--color-ink)" : "var(--color-surface)", color: draft.days.includes(i) ? "var(--color-bg)" : "var(--color-ink-3)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  {d[0]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label}>From</label>
              <input type="time" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </div>
            <div>
              <label style={label}>To</label>
              <input type="time" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Happy-hour discount % (optional)</label>
            <input type="number" min="0" max="100" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={draft.percentOff} onChange={(e) => setDraft({ ...draft, percentOff: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={!canSave || saving}
              onClick={() => (draft.id ? updateMutation.mutate(draft) : createMutation.mutate(draft))}
            >
              {saving ? "Saving…" : draft.id ? "Save" : "Add schedule"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {schedules.map((s: MenuSchedule) => (
            <div key={s.id} className="owner-rule-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                  {s.name}
                  {Number(s.percentOff) > 0 && <span className="chip good" style={{ marginLeft: 6, display: "inline-flex", fontSize: 11, padding: "2px 8px", borderRadius: 9999, background: "var(--color-green-soft)", color: "var(--color-green)" }}>{s.percentOff}% off</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{s.startTime}–{s.endTime}</div>
                <div style={{ display: "flex", gap: 3 }}>
                  {DAY_SHORT.map((d, i) => (
                    <span key={i} className={`owner-day-pill${s.days.includes(i) ? " on" : ""}`}>{d}</span>
                  ))}
                </div>
              </div>
              <div className="owner-rule-actions">
                <button type="button" style={iconBtn} title="Edit" onClick={() => setDraft({ id: s.id, name: s.name, days: s.days, startTime: s.startTime, endTime: s.endTime, percentOff: s.percentOff })}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
                </button>
                <button type="button" style={iconBtn} title="Delete" onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMutation.mutate(s.id) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft(BLANK_SCHEDULE)}
            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", justifyContent: "center", marginTop: 14, padding: 10, borderRadius: 9, border: "1px dashed var(--color-line-strong)", background: "none", color: "var(--color-ink-3)", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
          >
            + Add schedule
          </button>
        </>
      )}
    </div>
  )
}

function PaymentPane({ outlet }: { outlet: OwnerOutlet }) {
  const qc = useQueryClient()
  const [upiVpa, setUpiVpa] = useState(outlet.upiVpa ?? "")
  const [razorpayKeyId, setRazorpayKeyId] = useState("")
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("")
  const [saved, setSaved] = useState<"upi" | "razorpay" | null>(null)

  const upiMutation = useMutation({
    mutationFn: () => api.owner.updateOutlet(outlet.id, { upiVpa: upiVpa || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner-outlets"] }); setSaved("upi"); setTimeout(() => setSaved(null), 2000) },
  })
  const razorpayMutation = useMutation({
    mutationFn: () => api.owner.updateOutlet(outlet.id, { razorpayKeyId: razorpayKeyId || undefined, razorpayKeySecret: razorpayKeySecret || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner-outlets"] }); setSaved("razorpay"); setRazorpayKeySecret(""); setTimeout(() => setSaved(null), 2000) },
  })

  return (
    <div>
      <PaneHeading title="Payment methods" sub="How this outlet accepts customer payments." />

      <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>UPI</span>
          {outlet.upiVpa ? <span className="badge green">Connected</span> : <span className="badge amber">Not set up</span>}
        </div>
        <label style={label}>UPI VPA</label>
        <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={upiVpa} onChange={(e) => setUpiVpa(e.target.value.trim())} placeholder="merchant@ybl" />
        <button type="button" className="btn primary" disabled={upiMutation.isPending} onClick={() => upiMutation.mutate()} style={{ marginTop: 10 }}>
          {upiMutation.isPending ? "Saving…" : saved === "upi" ? "Saved ✓" : "Save"}
        </button>
      </div>

      <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Razorpay</span>
          {outlet.razorpayConfigured ? <span className="badge green">Connected</span> : <span className="badge red">Not connected</span>}
        </div>
        <p style={{ fontSize: 12, color: "var(--color-ink-3)", margin: "0 0 12px" }}>Accept cards, netbanking and wallets at checkout.</p>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Key ID</label>
          <input style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={razorpayKeyId} onChange={(e) => setRazorpayKeyId(e.target.value.trim())} placeholder="rzp_live_…" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={label}>Key secret</label>
          <input type="password" style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} value={razorpayKeySecret} onChange={(e) => setRazorpayKeySecret(e.target.value.trim())} placeholder="Leave blank to keep existing" />
        </div>
        <button type="button" className="btn primary" disabled={razorpayMutation.isPending} onClick={() => razorpayMutation.mutate()}>
          {razorpayMutation.isPending ? "Saving…" : saved === "razorpay" ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  )
}
