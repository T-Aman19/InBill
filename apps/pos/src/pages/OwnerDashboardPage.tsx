import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueries, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { formatCurrencyInt } from "@/lib/utils"
import { LogoMark } from "@/components/ui/LogoMark"
import { OperationTypeCards, operationTypeToSettings, type OperationType } from "@/components/ui/OperationTypeCards"
import { useAuthStore } from "@/stores/auth"
import { useUpgradeStore, promptUpgradeFromError } from "@/stores/upgrade"
import { AreaChart } from "@/components/charts/AreaChart"
import { OutletLeaderboard, type LeaderboardRow } from "./owner/OutletLeaderboard"
import { OutletSettingsDrawer } from "./owner/OutletSettingsDrawer"
import { PaymentMixPanel } from "./owner/PaymentMixPanel"

type CreateForm = { name: string; address: string; phone: string; gstin: string; timezone: string; operationType: OperationType }
type Range = "today" | "week" | "month"

const DEFAULT_CREATE: CreateForm = { name: "", address: "", phone: "", gstin: "", timezone: "Asia/Kolkata", operationType: "full_service" }
const RANGE_LABELS: Record<Range, string> = { today: "Today", week: "This Week", month: "This Month" }
const CAT_COLORS = ["var(--color-cat-1)", "var(--color-cat-2)", "var(--color-cat-3)", "var(--color-cat-4)"]
const UNLOCKED_PLANS = new Set(["growth", "enterprise", "self_hosted"])

// Local calendar-date components, not toISOString() — that formats in UTC, which
// silently shifts a local midnight (e.g. "Aug 1 00:00 IST") back to the previous
// day once serialized. All the range math here is local-Date arithmetic, so the
// formatter has to stay local too or every boundary drifts by one day for anyone
// in a positive UTC offset (all of India included).
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

function getRangeDates(range: Range): { from: string; to: string } | undefined {
  if (range === "today") return undefined
  const today = new Date()
  if (range === "week") {
    const from = new Date(today); from.setDate(today.getDate() - 6)
    return { from: fmtDate(from), to: fmtDate(today) }
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: fmtDate(from), to: fmtDate(today) }
}

// Prior-equivalent window for "vs last period" deltas — same length, immediately before.
function getPriorRangeDates(range: Range): { from: string; to: string } {
  const today = new Date()
  if (range === "today") { const y = daysAgo(1); return { from: fmtDate(y), to: fmtDate(y) } }
  if (range === "week") {
    const to = daysAgo(7)
    const from = new Date(to); from.setDate(to.getDate() - 6)
    return { from: fmtDate(from), to: fmtDate(to) }
  }
  // Month-to-date vs the same day count last month (not the whole prior month —
  // comparing 5 days of August to all 31 days of July would read as a false crash).
  const firstOfPriorMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const priorMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  const priorTo = new Date(firstOfPriorMonth.getFullYear(), firstOfPriorMonth.getMonth(), Math.min(today.getDate(), priorMonthLastDay))
  return { from: fmtDate(firstOfPriorMonth), to: fmtDate(priorTo) }
}

function pctDelta(cur: number, prior: number): number {
  if (prior > 0) return ((cur - prior) / prior) * 100
  return cur > 0 ? 100 : 0
}

// Trend endpoint only returns days with at least one bill — fill the gaps with
// 0 so summing across outlets and charting a continuous line both work.
function zeroFillDaily(points: { date: string; revenue: number }[], fromStr: string, toStr: string): { date: string; value: number }[] {
  const byDate = new Map(points.map((p) => [p.date, p.revenue]))
  const result: { date: string; value: number }[] = []
  // Parse/step/format entirely in UTC so the YYYY-MM-DD keys generated here are
  // a pure function of the input strings, independent of the browser's local
  // timezone — mixing local parsing with UTC formatting silently shifts dates.
  const cur = new Date(`${fromStr}T00:00:00Z`)
  const end = new Date(`${toStr}T00:00:00Z`)
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10)
    result.push({ date: key, value: byDate.get(key) ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return result
}

function DeltaText({ pct }: { pct: number }) {
  const up = pct >= 0
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontWeight: 600, color: up ? "var(--color-green)" : "var(--color-red)" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {up ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
      </svg>
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export default function OwnerDashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE)
  const [createErr, setCreateErr] = useState("")
  const [range, setRange] = useState<Range>("week")
  const [showChangePw, setShowChangePw] = useState(false)
  const [changePwForm, setChangePwForm] = useState({ currentPassword: "", newPassword: "", confirm: "" })
  const [changePwErr, setChangePwErr] = useState("")
  const [changePwOk, setChangePwOk] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [settingsOutletId, setSettingsOutletId] = useState<string | null>(null)

  useEffect(() => {
    if (!localStorage.getItem("inbill_owner_token")) navigate({ to: "/owner/login" })
  }, [navigate])

  const dates = getRangeDates(range)
  const priorDates = getPriorRangeDates(range)

  const { data: me } = useQuery({ queryKey: ["owner-me"], queryFn: api.owner.me })

  const { data: outlets = [], isLoading, error } = useQuery({
    queryKey: ["owner-outlets", range],
    queryFn: () => api.owner.outlets(dates?.from, dates?.to),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })
  const { data: outletsPrior = [] } = useQuery({
    queryKey: ["owner-outlets-prior", range],
    queryFn: () => api.owner.outlets(priorDates.from, priorDates.to),
    placeholderData: keepPreviousData,
  })

  const trendFrom = fmtDate(daysAgo(29))
  const trendTo = fmtDate(new Date())
  const trendQueries = useQueries({
    queries: outlets.map((o) => ({
      queryKey: ["owner-trend", o.id, trendFrom, trendTo],
      queryFn: () => api.owner.trend(o.id, trendFrom, trendTo),
    })),
  })

  const priorById = new Map(outletsPrior.map((o) => [o.id, o.revenue]))
  const rows: LeaderboardRow[] = outlets.map((o, i) => ({
    ...o,
    color: CAT_COLORS[i % CAT_COLORS.length]!,
    rank: 0,
    share: 0,
    deltaPct: pctDelta(o.revenue, priorById.get(o.id) ?? 0),
  }))
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  rows.sort((a, b) => b.revenue - a.revenue)
  rows.forEach((r, i) => { r.rank = i + 1; r.share = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0 })

  const zeroFilled = trendQueries.map((q) => zeroFillDaily(q.data?.points ?? [], trendFrom, trendTo))
  const heroSeries = (zeroFilled[0] ?? []).map((p, dayIdx) => ({
    date: p.date,
    value: zeroFilled.reduce((s, series) => s + (series[dayIdx]?.value ?? 0), 0),
  }))
  const sparklines: Record<string, number[]> = {}
  outlets.forEach((o, i) => { sparklines[o.id] = (zeroFilled[i] ?? []).slice(-7).map((p) => p.value) })

  const totalBills = rows.reduce((s, r) => s + r.billCount, 0)
  const totalOpen = rows.reduce((s, r) => s + r.openOrderCount, 0)
  const avgTicket = totalBills > 0 ? totalRevenue / totalBills : 0
  const totalPriorRevenue = outletsPrior.reduce((s, o) => s + o.revenue, 0)
  const totalDeltaPct = pctDelta(totalRevenue, totalPriorRevenue)

  const combinedByPaymentMode = rows.reduce<Record<string, number>>((acc, r) => {
    for (const [mode, amt] of Object.entries(r.byPaymentMode)) acc[mode] = (acc[mode] ?? 0) + amt
    return acc
  }, {})

  const alerts = [
    ...rows.filter((r) => r.deltaPct <= -2).map((r) => ({ sev: "warn" as const, t1: r.name, t2: `Revenue down ${Math.abs(r.deltaPct).toFixed(0)}% vs previous period` })),
    ...rows.filter((r) => !r.upiVpa && !r.razorpayConfigured).map((r) => ({ sev: "bad" as const, t1: r.name, t2: "No payment method configured" })),
  ]

  const isLocked = !UNLOCKED_PLANS.has(me?.plan ?? "free") && outlets.length >= 1
  const settingsOutlet = settingsOutletId ? outlets.find((o) => o.id === settingsOutletId) : undefined

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.owner.createOutlet(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-outlets"] })
      setShowCreate(false)
      setCreateForm(DEFAULT_CREATE)
    },
    onError: (e: Error) => { if (!promptUpgradeFromError(e)) setCreateErr(e.message) },
  })

  const switchMutation = useMutation({
    mutationFn: (outletId: string) => api.owner.switchOutlet(outletId),
    onSuccess: (res, outletId) => {
      localStorage.setItem("inbill_outlet_id", res.outlet.id)
      localStorage.setItem("inbill_outlet_name", res.outlet.name)
      useAuthStore.getState().login(res.token, res.user, res.outlet.id, res.outlet.name)
      const outlet = outlets.find((o) => o.id === outletId)
      const needsTables = outlet?.settings?.hasTables !== false
      const needsSetup = (needsTables && !outlet?.tableCount) || !outlet?.menuItemCount
      if (needsSetup) {
        localStorage.removeItem("inbill_setup_dismissed")
        navigate({ to: "/manager" })
      } else {
        navigate({ to: "/floor" })
      }
    },
  })

  const quickActionMutation = useMutation({
    mutationFn: ({ outletId }: { outletId: string; tab: string }) => api.owner.switchOutlet(outletId),
    onSuccess: (res, { tab }) => {
      localStorage.setItem("inbill_outlet_id", res.outlet.id)
      localStorage.setItem("inbill_outlet_name", res.outlet.name)
      useAuthStore.getState().login(res.token, res.user, res.outlet.id, res.outlet.name)
      if (tab === "inventory") navigate({ to: "/inventory" })
      else navigate({ to: "/manager", search: { tab } })
    },
  })

  const changePwMutation = useMutation({
    mutationFn: () => api.owner.changePassword(changePwForm.currentPassword, changePwForm.newPassword),
    onSuccess: () => { setChangePwOk(true) },
    onError: (e: Error) => setChangePwErr(e.message),
  })
  const sendResetMutation = useMutation({
    mutationFn: api.owner.sendResetLink,
    onSuccess: () => { setResetSent(true) },
    onError: (e: Error) => setChangePwErr(e.message),
  })

  function handleChangePw(e: React.FormEvent) {
    e.preventDefault()
    setChangePwErr("")
    if (changePwForm.newPassword.length < 8) { setChangePwErr("New password must be at least 8 characters"); return }
    if (changePwForm.newPassword !== changePwForm.confirm) { setChangePwErr("Passwords do not match"); return }
    changePwMutation.mutate()
  }
  function closeChangePw() {
    setShowChangePw(false)
    setChangePwForm({ currentPassword: "", newPassword: "", confirm: "" })
    setChangePwErr("")
    setChangePwOk(false)
    setResetSent(false)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr("")
    if (!createForm.name.trim()) { setCreateErr("Outlet name is required"); return }
    if (!createForm.address.trim()) { setCreateErr("Address is required"); return }
    if (!/^[6-9]\d{9}$/.test(createForm.phone)) { setCreateErr("Enter a valid 10-digit Indian mobile number"); return }
    if (createForm.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(createForm.gstin)) {
      setCreateErr("GSTIN must be a valid 15-character Indian GST number")
      return
    }
    const { operationType, ...outletFields } = createForm
    createMutation.mutate({
      ...outletFields,
      name: createForm.name.trim(),
      address: createForm.address.trim(),
      settings: operationTypeToSettings(operationType),
    })
  }

  function handleAddOutletClick() {
    if (isLocked) {
      useUpgradeStore.getState().open({ feature: "multi_outlet", reason: "plan_required", requiredPlan: "growth" })
      return
    }
    setShowCreate(true)
  }

  function logout() {
    localStorage.removeItem("inbill_owner_token")
    navigate({ to: "/owner/login" })
  }

  const ownerInitials = (me?.name || me?.email || "O").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
        <p style={{ color: "var(--color-ink-3)" }}>Loading…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--color-red)", marginBottom: 16 }}>{(error as Error).message}</p>
          <button onClick={logout} style={{ fontSize: 13, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    )
  }

  // ── Empty state — no outlets yet ──────────────────────────────────────────
  if (outlets.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
        <header style={{ height: 64, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 28px", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: "var(--color-ink)" }}><LogoMark size={28} /></div>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>InBill Owner</span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={logout}>Sign out</button>
        </header>
        <main style={{ padding: 32, overflow: "auto", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: "var(--color-accent)", marginBottom: 18 }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" /></svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 8px" }}>Welcome to InBill</h2>
              <p style={{ fontSize: 14, color: "var(--color-ink-3)", margin: 0 }}>Set up your restaurant in 3 quick steps and you'll be taking orders in minutes.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
              {[
                { step: 1, title: "Create your outlet", desc: "Add your restaurant's name, address, and contact details.", action: true },
                { step: 2, title: "Set up your menu", desc: "Add categories and menu items inside the POS Manager.", action: false },
                { step: 3, title: "Add your staff", desc: "Create PINs for managers, cashiers, captains, and kitchen staff.", action: false },
              ].map(({ step, title, desc, action }) => (
                <div key={step} style={{ display: "flex", gap: 16, padding: "18px 20px", borderRadius: 12, border: `1px solid ${action ? "var(--color-accent-soft)" : "var(--color-line)"}`, background: action ? "var(--color-accent-soft)" : "var(--color-surface)", opacity: action ? 1 : 0.55 }}>
                  <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: action ? "var(--color-accent)" : "var(--color-surface-2)", color: action ? "var(--color-accent-ink)" : "var(--color-ink-3)" }}>{step}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)", marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 13, color: "var(--color-ink-3)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn primary" onClick={() => setShowCreate(true)} style={{ width: "100%", height: 46, fontSize: 15, justifyContent: "center" }}>
              Create your first outlet →
            </button>
          </div>
        </main>
        {showCreate && (
          <CreateOutletModal form={createForm} setForm={setCreateForm} err={createErr} pending={createMutation.isPending} onCancel={() => setShowCreate(false)} onSubmit={handleCreate} />
        )}
      </div>
    )
  }

  const jumpTarget = rows[0]!

  return (
    <div style={{ minHeight: "100vh", fontFamily: "var(--font-sans)", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{ width: 224, flexShrink: 0, background: "var(--color-surface)", borderRight: "1px solid var(--color-line)", display: "flex", flexDirection: "column", padding: "18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px 20px" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--color-ink)", color: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LogoMark size={16} />
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>InBill Owner</span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <button type="button" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", border: "none", textAlign: "left", cursor: "default" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
            Overview
          </button>
          <button type="button" onClick={() => navigate({ to: "/owner/billing" })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, fontWeight: 500, background: "none", color: "var(--color-ink-3)", border: "none", textAlign: "left", cursor: "pointer" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
            Billing
          </button>
        </nav>
        <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 12, display: "flex", alignItems: "center", gap: 9 }}>
          <button type="button" onClick={() => setShowChangePw(true)} title="Change password" style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0 }}>
            {ownerInitials}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name}</div>
            <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Owner</div>
          </div>
          <button type="button" onClick={logout} title="Sign out" style={{ background: "none", border: "none", color: "var(--color-ink-3)", padding: 4, borderRadius: 6, cursor: "pointer", display: "flex" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, background: "var(--color-bg)" }}>
        <div style={{ height: 62, borderBottom: "1px solid var(--color-line)", background: "var(--color-surface)", display: "flex", alignItems: "center", gap: 12, padding: "0 26px", position: "sticky", top: 0, zIndex: 2 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 16.5, fontWeight: 700 }}>Overview</h1>
          <span style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>{dateStr}</span>
          <div style={{ flex: 1 }} />
          <div className="range-toggle-wrap" style={{ display: "inline-flex", gap: 3, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 9999, padding: 3 }}>
            {(["today", "week", "month"] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{ fontSize: 12, fontWeight: range === r ? 600 : 400, padding: "6px 14px", borderRadius: 9999, border: "none", background: range === r ? "var(--color-ink)" : "transparent", color: range === r ? "var(--color-bg)" : "var(--color-ink-3)", cursor: "pointer" }}>
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <button className={isLocked ? "btn locked" : "btn primary"} onClick={handleAddOutletClick} style={isLocked ? { background: "var(--color-surface-2)", color: "var(--color-ink-3)" } : undefined}>
              {isLocked && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>}
              + Add outlet
            </button>
          </div>
        </div>

        <div style={{ padding: "24px 26px 60px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 18, alignItems: "start" }}>
          <div>
            {/* Stat row */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { k: "Revenue", v: formatCurrencyInt(totalRevenue) },
                { k: "Bills", v: String(totalBills) },
                { k: "Open orders", v: String(totalOpen) },
                { k: "Avg ticket", v: totalBills > 0 ? formatCurrencyInt(avgTicket) : "—" },
              ].map((s) => (
                <div key={s.k} style={{ flex: "1 1 150px", borderRadius: 12, border: "1px solid var(--color-line)", background: "var(--color-surface)", padding: "12px 14px", boxShadow: "var(--shadow-1)" }}>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>{s.k}</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600 }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Hero trend card */}
            <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, boxShadow: "var(--shadow-1)", padding: "22px 24px 16px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 4, flexWrap: "wrap" }}>
                <div>
                  <span className="eyebrow">Revenue · {RANGE_LABELS[range].toLowerCase()}</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 600, lineHeight: 1.1 }}>{formatCurrencyInt(totalRevenue)}</div>
                  <div style={{ fontSize: 12.5, color: "var(--color-ink-3)", marginTop: 4 }}>Chart shows the last 30 days</div>
                </div>
                <div style={{ fontSize: 14 }}>
                  <DeltaText pct={totalDeltaPct} /> <span style={{ color: "var(--color-ink-3)", fontWeight: 400, fontSize: 12 }}>vs previous period</span>
                </div>
              </div>
              <AreaChart points={heroSeries} color="var(--color-accent)" height={200} formatX={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
            </div>

            {/* Leaderboard */}
            <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, boxShadow: "var(--shadow-1)", padding: "20px 22px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15.5 }}>Outlet leaderboard</h2>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>sorted by revenue · {RANGE_LABELS[range].toLowerCase()}</span>
              </div>
              <OutletLeaderboard rows={rows} sparklines={sparklines} onOpenSettings={setSettingsOutletId} onSwitch={(id) => switchMutation.mutate(id)} />
            </div>

            {/* Payment mix */}
            <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, boxShadow: "var(--shadow-1)", padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15.5 }}>Payment mix</h2>
              </div>
              <PaymentMixPanel byPaymentMode={combinedByPaymentMode} />
            </div>
          </div>

          {/* Right rail */}
          <div>
            <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, boxShadow: "var(--shadow-1)", padding: "16px 18px", marginBottom: 18 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15.5, marginBottom: 14 }}>Needs attention</h2>
              {alerts.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--color-ink-3)", display: "flex", alignItems: "center", gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  All outlets healthy
                </div>
              ) : alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < alerts.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                  <div style={{ width: 3, borderRadius: 3, alignSelf: "stretch", flexShrink: 0, background: a.sev === "bad" ? "var(--color-red)" : "var(--color-amber)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{a.t1}</div>
                    <div style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>{a.t2}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, boxShadow: "var(--shadow-1)", padding: "16px 18px" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15.5, marginBottom: 14 }}>Jump to · {jumpTarget.name.replace(/^.*—\s*/, "")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { tab: "menu", label: "Menu", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z" /></svg> },
                  { tab: "staff", label: "Staff", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg> },
                  { tab: "shifts", label: "Reports", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg> },
                  { tab: "inventory", label: "Inventory", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> },
                ].map((a) => (
                  <button
                    key={a.tab}
                    type="button"
                    disabled={quickActionMutation.isPending}
                    onClick={() => quickActionMutation.mutate({ outletId: jumpTarget.id, tab: a.tab })}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 8, background: "none", border: "none", fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)", textAlign: "left", cursor: "pointer" }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-2)", flexShrink: 0 }}>{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateOutletModal form={createForm} setForm={setCreateForm} err={createErr} pending={createMutation.isPending} onCancel={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}

      {showChangePw && (
        <ChangePasswordModal
          isCloud={!!me?.isCloud}
          email={me?.email}
          form={changePwForm}
          setForm={setChangePwForm}
          err={changePwErr}
          setErr={setChangePwErr}
          ok={changePwOk}
          resetSent={resetSent}
          changeMutation={changePwMutation}
          sendResetMutation={sendResetMutation}
          onSubmit={handleChangePw}
          onClose={closeChangePw}
        />
      )}

      {settingsOutlet && <OutletSettingsDrawer outlet={settingsOutlet} onClose={() => setSettingsOutletId(null)} />}
    </div>
  )
}

function CreateOutletModal({ form, setForm, err, pending, onCancel, onSubmit }: {
  form: CreateForm
  setForm: React.Dispatch<React.SetStateAction<CreateForm>>
  err: string
  pending: boolean
  onCancel: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div style={{ background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", width: "100%", maxWidth: 500, padding: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }}>Add Outlet</h2>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(["name", "address", "phone", "gstin"] as const).map((field) => {
            const labels: Record<typeof field, string> = { name: "Name", address: "Address", phone: "Phone", gstin: "GSTIN (optional)" }
            const maxLengths: Record<typeof field, number> = { name: 100, address: 500, phone: 10, gstin: 15 }
            const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              let v = e.target.value
              if (field === "phone") v = v.replace(/\D/g, "").slice(0, 10)
              else if (field === "gstin") v = v.toUpperCase().slice(0, 15)
              setForm((f) => ({ ...f, [field]: v }))
            }
            return (
              <div key={field}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>{labels[field]}</label>
                <input
                  style={{ width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)" }}
                  value={form[field]}
                  onChange={onChange}
                  maxLength={maxLengths[field]}
                  inputMode={field === "phone" ? "numeric" : undefined}
                  placeholder={field === "phone" ? "10-digit mobile number" : field === "gstin" ? "e.g. 29ABCDE1234F1Z5" : undefined}
                  required={field !== "gstin"}
                />
              </div>
            )
          })}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>How does this outlet operate?</label>
            <OperationTypeCards value={form.operationType} onChange={(operationType) => setForm((f) => ({ ...f, operationType }))} />
          </div>
          {err && <p style={{ fontSize: 13, color: "var(--color-red)", margin: 0 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button type="button" className="btn ghost" onClick={onCancel} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
            <button type="submit" className="btn primary" disabled={pending} style={{ flex: 1, justifyContent: "center", height: 40 }}>
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChangePasswordModal({ isCloud, email, form, setForm, err, setErr, ok, resetSent, changeMutation, sendResetMutation, onSubmit, onClose }: {
  isCloud: boolean
  email?: string
  form: { currentPassword: string; newPassword: string; confirm: string }
  setForm: React.Dispatch<React.SetStateAction<{ currentPassword: string; newPassword: string; confirm: string }>>
  err: string
  setErr: (s: string) => void
  ok: boolean
  resetSent: boolean
  changeMutation: { isPending: boolean; mutate: () => void }
  sendResetMutation: { isPending: boolean; mutate: () => void }
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div style={{ background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", width: "100%", maxWidth: 400, padding: 28 }}>
        {isCloud ? (
          resetSent ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ width: 44, height: 44, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>Check your inbox</div>
              <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "0 0 20px", lineHeight: 1.5 }}>We sent a password reset link to <strong>{email}</strong>. It expires in 1 hour.</p>
              <button className="btn primary" onClick={onClose} style={{ width: "100%", height: 40, justifyContent: "center" }}>Done</button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 8px" }}>Reset password</h2>
              <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "0 0 20px", lineHeight: 1.5 }}>
                We&apos;ll email a secure reset link to <strong>{email ?? "your account email"}</strong> — click it to set a new password (no current password needed). The link expires in 1 hour.
              </p>
              {err && <p style={{ fontSize: 13, color: "var(--color-red)", margin: "0 0 12px" }}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
                <button type="button" className="btn primary" disabled={sendResetMutation.isPending} onClick={() => { setErr(""); sendResetMutation.mutate() }} style={{ flex: 1, justifyContent: "center", height: 40 }}>
                  {sendResetMutation.isPending ? "Sending…" : "Email reset link"}
                </button>
              </div>
            </>
          )
        ) : ok ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ width: 44, height: 44, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>Password updated</div>
            <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "0 0 20px" }}>Your password has been changed successfully.</p>
            <button className="btn primary" onClick={onClose} style={{ width: "100%", height: 40, justifyContent: "center" }}>Done</button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }}>Change Password</h2>
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {([
                { key: "currentPassword", label: "Current password" },
                { key: "newPassword", label: "New password" },
                { key: "confirm", label: "Confirm new password" },
              ] as { key: keyof typeof form; label: string }[]).map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>{label}</label>
                  <input
                    type="password"
                    style={{ width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)" }}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    required
                    minLength={key === "newPassword" ? 8 : undefined}
                    maxLength={key === "currentPassword" ? undefined : 128}
                    placeholder={key === "newPassword" ? "Min 8 characters" : ""}
                  />
                </div>
              ))}
              {err && <p style={{ fontSize: 13, color: "var(--color-red)", margin: 0 }}>{err}</p>}
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
                <button type="submit" className="btn primary" disabled={changeMutation.isPending} style={{ flex: 1, justifyContent: "center", height: 40 }}>
                  {changeMutation.isPending ? "Updating…" : "Update"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
