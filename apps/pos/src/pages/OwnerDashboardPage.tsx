import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"

type OutletCard = {
  id: string
  name: string
  address: string
  gstin?: string
  setupCode?: string
  revenue: number
  billCount: number
  byPaymentMode: Record<string, number>
  openOrderCount: number
  razorpayConfigured: boolean
  upiVpa?: string
  tableCount: number
  menuItemCount: number
  staffCount: number
}

type CreateForm = { name: string; address: string; phone: string; gstin: string; timezone: string }
type Range = "today" | "week" | "month"

const DEFAULT_CREATE: CreateForm = { name: "", address: "", phone: "", gstin: "", timezone: "Asia/Kolkata" }

const RANGE_LABELS: Record<Range, string> = { today: "Today", week: "This Week", month: "This Month" }

function getRangeDates(range: Range): { from: string; to: string } | undefined {
  if (range === "today") return undefined
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (range === "week") {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return { from: fmt(from), to: fmt(today) }
  }
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: fmt(from), to: fmt(today) }
}

export default function OwnerDashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE)
  const [createErr, setCreateErr] = useState("")
  const [range, setRange] = useState<Range>("today")
  const [showChangePw, setShowChangePw] = useState(false)
  const [changePwForm, setChangePwForm] = useState({ currentPassword: "", newPassword: "", confirm: "" })
  const [changePwErr, setChangePwErr] = useState("")
  const [changePwOk, setChangePwOk] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem("inbill_owner_token")) navigate({ to: "/owner/login" })
  }, [navigate])

  const dates = getRangeDates(range)

  const { data: outlets = [], isLoading, error } = useQuery({
    queryKey: ["owner-outlets", range],
    queryFn: () => api.owner.outlets(dates?.from, dates?.to),
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.owner.createOutlet(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-outlets"] })
      setShowCreate(false)
      setCreateForm(DEFAULT_CREATE)
    },
    onError: (e: Error) => setCreateErr(e.message),
  })

  const switchMutation = useMutation({
    mutationFn: (outletId: string) => api.owner.switchOutlet(outletId),
    onSuccess: (res, outletId) => {
      localStorage.setItem("inbill_outlet_id", res.outlet.id)
      localStorage.setItem("inbill_outlet_name", res.outlet.name)
      useAuthStore.getState().login(res.token, res.user, res.outlet.id, res.outlet.name)
      const outlet = (outlets as OutletCard[]).find((o) => o.id === outletId)
      const needsSetup = !outlet?.tableCount || !outlet?.menuItemCount
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
      if (tab === "inventory") {
        navigate({ to: "/inventory" })
      } else {
        navigate({ to: "/manager", search: { tab } })
      }
    },
  })

  const changePwMutation = useMutation({
    mutationFn: () => api.owner.changePassword(changePwForm.currentPassword, changePwForm.newPassword),
    onSuccess: () => { setChangePwOk(true) },
    onError: (e: Error) => setChangePwErr(e.message),
  })

  function handleChangePw(e: React.FormEvent) {
    e.preventDefault()
    setChangePwErr("")
    if (changePwForm.newPassword !== changePwForm.confirm) { setChangePwErr("Passwords do not match"); return }
    changePwMutation.mutate()
  }

  function closeChangePw() {
    setShowChangePw(false)
    setChangePwForm({ currentPassword: "", newPassword: "", confirm: "" })
    setChangePwErr("")
    setChangePwOk(false)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr("")
    createMutation.mutate(createForm)
  }

  function logout() {
    localStorage.removeItem("inbill_owner_token")
    navigate({ to: "/owner/login" })
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
  }

  const outletList = outlets as OutletCard[]
  const totalRevenue = outletList.reduce((s, o) => s + o.revenue, 0)
  const totalBills = outletList.reduce((s, o) => s + o.billCount, 0)
  const totalOpen = outletList.reduce((s, o) => s + o.openOrderCount, 0)
  const avgTicket = totalBills > 0 ? Math.round(totalRevenue / totalBills) : 0

  const unpaidOutlets = outletList.filter((o) => !o.upiVpa && !o.razorpayConfigured)

  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })

  const ownerInitials = (() => {
    try {
      const token = localStorage.getItem("inbill_owner_token") || ""
      const payload = JSON.parse(atob(token.split(".")[1] || btoa("{}")))
      const name: string = payload.name || payload.email || "O"
      return name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    } catch {
      return "O"
    }
  })()

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

  const statPills = [
    { k: "Revenue", v: fmt(totalRevenue), sub: RANGE_LABELS[range].toLowerCase(), tone: "green" as const },
    { k: "Bills", v: String(totalBills), sub: RANGE_LABELS[range].toLowerCase(), tone: "neutral" as const },
    { k: "Open orders", v: String(totalOpen), sub: totalOpen > 0 ? "needs attention" : "all clear", tone: totalOpen > 0 ? "amber" as const : "neutral" as const },
    { k: "Avg ticket", v: avgTicket > 0 ? fmt(avgTicket) : "—", sub: RANGE_LABELS[range].toLowerCase(), tone: "neutral" as const },
  ]

  const PAYMENT_MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", razorpay: "Razorpay" }

  const quickActions = [
    {
      label: "Menu", tab: "menu",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/></svg>,
    },
    {
      label: "Staff", tab: "staff",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    },
    {
      label: "Reports", tab: "shifts",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
    {
      label: "Inventory", tab: "inventory",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    },
  ]

  const firstOutlet = outletList[0]

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ height: 64, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 28px", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "var(--color-ink)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>InBill Owner</span>
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 13, color: "var(--color-ink-3)" }}>{dateStr}</span>

        <button className="btn primary" onClick={() => setShowCreate(true)} style={{ fontSize: 13, padding: "0 16px", height: 34 }}>
          + Add outlet
        </button>

        <div style={{ width: 1, height: 22, background: "var(--color-line)", margin: "0 4px" }} />

        <button
          className="btn ghost"
          onClick={() => setShowChangePw(true)}
          title="Change password"
          style={{ padding: "0 8px", height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-soft)", color: "var(--color-accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
            {ownerInitials}
          </div>
        </button>

        <button
          className="btn ghost"
          onClick={logout}
          title="Sign out"
          style={{ padding: "0 8px", height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </header>

      {/* Body */}
      <main style={{ padding: 32, overflow: "auto", flex: 1 }}>
        {/* Range toggle */}
        {outletList.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {(["today", "week", "month"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  fontSize: 12,
                  fontWeight: range === r ? 600 : 400,
                  padding: "5px 14px",
                  borderRadius: 9999,
                  border: range === r ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                  background: range === r ? "var(--color-ink)" : "transparent",
                  color: range === r ? "#fff" : "var(--color-ink-3)",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}

        {/* Stat strip */}
        <div style={{ display: "flex", gap: 10, marginBottom: outletList.length > 0 && unpaidOutlets.length > 0 ? 12 : 28, flexWrap: "wrap" }}>
          {statPills.map((pill) => (
            <div
              key={pill.k}
              style={{
                borderRadius: 9999,
                border: "1px solid var(--color-line)",
                background: "var(--color-surface)",
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-ink-3)" }}>{pill.k}</span>
              <span style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }}>{pill.v}</span>
              <span style={{
                fontSize: 11,
                color: pill.tone === "green" ? "var(--color-green)" : pill.tone === "amber" ? "var(--color-amber)" : "var(--color-ink-3)",
              }}>{pill.sub}</span>
            </div>
          ))}
        </div>

        {/* Alerts strip */}
        {outletList.length > 0 && unpaidOutlets.length > 0 && (
          <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: "var(--color-amber-soft, #fff8e1)", border: "1px solid var(--color-amber, #f59e0b)", fontSize: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber, #f59e0b)" strokeWidth="2" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ color: "var(--color-amber-dark, #92400e)", fontWeight: 500 }}>
                {unpaidOutlets.length === 1
                  ? `"${unpaidOutlets[0]?.name}" has no payment method configured`
                  : `${unpaidOutlets.length} outlets have no payment method configured`}
              </span>
            </div>
          </div>
        )}

        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", margin: 0 }}>Outlets</h2>
          <div style={{ flex: 1 }} />
          {outletList.length > 0 && (
            <>
              <span className="dot green" />
              <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>All systems operational</span>
            </>
          )}
        </div>

        {outletList.length === 0 ? (
          /* Empty state */
          <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 48 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: "var(--color-accent)", marginBottom: 18 }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                  <path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/>
                </svg>
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
                <div
                  key={step}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "18px 20px",
                    borderRadius: 12,
                    border: `1px solid ${action ? "var(--color-accent-soft)" : "var(--color-line)"}`,
                    background: action ? "var(--color-accent-soft)" : "var(--color-surface)",
                    opacity: action ? 1 : 0.55,
                  }}
                >
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
        ) : (
          <>
            {/* Outlet card grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 32 }}>
              {outletList.map((outlet) => {
                const paymentEntries = Object.entries(outlet.byPaymentMode).filter(([, amt]) => amt > 0)
                return (
                  <div
                    key={outlet.id}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 12,
                      padding: 22,
                      boxShadow: "var(--shadow-1, 0 1px 4px rgba(0,0,0,.06))",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {/* Card header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>{outlet.name}</div>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "var(--color-surface-2)",
                          border: "1px solid var(--color-line)",
                          borderRadius: 9999,
                          padding: "3px 10px",
                          fontSize: 11,
                          color: "var(--color-ink-3)",
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                          {outlet.address}
                        </span>
                      </div>
                      {outlet.openOrderCount > 0 && (
                        <span className="badge amber" style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                          <span className="dot amber" style={{ flexShrink: 0 }} />
                          {outlet.openOrderCount} open
                        </span>
                      )}
                    </div>

                    {/* Stats 2-col grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-line)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--color-line)" }}>
                      <div style={{ background: "var(--color-surface)", padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-3)", marginBottom: 4 }}>Revenue</div>
                        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }}>{fmt(outlet.revenue)}</div>
                      </div>
                      <div style={{ background: "var(--color-surface)", padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-3)", marginBottom: 4 }}>Bills</div>
                        <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--color-ink)" }}>{outlet.billCount}</div>
                      </div>
                    </div>

                    {/* Payment breakdown */}
                    {paymentEntries.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {paymentEntries.map(([mode, amount]) => (
                          <span key={mode} style={{ fontSize: 11, background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 9999, padding: "3px 10px", color: "var(--color-ink-2)" }}>
                            {PAYMENT_MODE_LABEL[mode] ?? mode} · {fmt(amount)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Setup status chips */}
                    {(outlet.tableCount === 0 || outlet.menuItemCount === 0 || outlet.staffCount === 0) && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {outlet.tableCount === 0 && (
                          <span style={{ background: "var(--color-amber-soft, #fff8e1)", color: "var(--color-amber)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-amber-soft, #ffe082)" }}>No tables</span>
                        )}
                        {outlet.menuItemCount === 0 && (
                          <span style={{ background: "var(--color-amber-soft, #fff8e1)", color: "var(--color-amber)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-amber-soft, #ffe082)" }}>No menu</span>
                        )}
                        {outlet.staffCount === 0 && (
                          <span style={{ background: "var(--color-surface-2)", color: "var(--color-ink-3)", fontSize: 11, borderRadius: 9999, padding: "3px 9px", border: "1px solid var(--color-line)" }}>No staff</span>
                        )}
                      </div>
                    )}

                    {/* Card footer */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2, marginTop: "auto" }}>
                      {outlet.setupCode && (
                        <span title="Device setup code — share with staff" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-ink-3)", letterSpacing: ".08em", border: "1px solid var(--color-line)", borderRadius: 6, padding: "2px 8px" }}>
                          {outlet.setupCode}
                        </span>
                      )}
                      {outlet.upiVpa && (
                        <span style={{ background: "var(--color-blue-soft)", color: "var(--color-blue)", fontSize: 11, borderRadius: 9999, padding: "3px 9px" }}>UPI</span>
                      )}
                      {outlet.razorpayConfigured && (
                        <span style={{ background: "var(--color-blue-soft)", color: "var(--color-blue)", fontSize: 11, borderRadius: 9999, padding: "3px 9px" }}>Razorpay</span>
                      )}
                      <div style={{ flex: 1 }} />
                      {outlet.tableCount > 0 && outlet.menuItemCount > 0 ? (
                        <button
                          onClick={() => switchMutation.mutate(outlet.id)}
                          disabled={switchMutation.isPending}
                          style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                        >
                          Open POS →
                        </button>
                      ) : (
                        <button
                          onClick={() => switchMutation.mutate(outlet.id)}
                          disabled={switchMutation.isPending}
                          style={{ fontSize: 13, fontWeight: 600, color: "var(--color-amber)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                        >
                          Finish setup →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Quick actions */}
            {firstOutlet && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Quick access{outletList.length === 1 ? ` · ${firstOutlet.name}` : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => quickActionMutation.mutate({ outletId: firstOutlet.id, tab: action.tab })}
                      disabled={quickActionMutation.isPending}
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-line)",
                        borderRadius: 12,
                        padding: "18px 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        transition: "border-color 0.12s, box-shadow 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.borderColor = "var(--color-accent)"
                        el.style.boxShadow = "0 0 0 3px var(--color-accent-soft)"
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.borderColor = "var(--color-line)"
                        el.style.boxShadow = "none"
                      }}
                    >
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--color-surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-2)" }}>
                        {action.icon}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink-2)" }}>{action.label}</span>
                    </button>
                  ))}
                </div>
                {outletList.length > 1 && (
                  <p style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 8 }}>Opens first outlet. Use outlet cards above to enter a specific location.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create outlet modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", width: "100%", maxWidth: 440, padding: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }}>Add Outlet</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(["name", "address", "phone", "gstin"] as const).map((field) => (
                <div key={field}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5, textTransform: "capitalize" }}>
                    {field === "gstin" ? "GSTIN (optional)" : field}
                  </label>
                  <input
                    style={{ width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)" }}
                    value={createForm[field]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))}
                    required={field !== "gstin"}
                  />
                </div>
              ))}
              {createErr && <p style={{ fontSize: 13, color: "var(--color-red)", margin: 0 }}>{createErr}</p>}
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button type="button" className="btn ghost" onClick={() => setShowCreate(false)} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
                <button type="submit" className="btn primary" disabled={createMutation.isPending} style={{ flex: 1, justifyContent: "center", height: 40 }}>
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showChangePw && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", width: "100%", maxWidth: 400, padding: 28 }}>
            {changePwOk ? (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ width: 44, height: 44, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>Password updated</div>
                <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "0 0 20px" }}>Your password has been changed successfully.</p>
                <button className="btn primary" onClick={closeChangePw} style={{ width: "100%", height: 40, justifyContent: "center" }}>Done</button>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }}>Change Password</h2>
                <form onSubmit={handleChangePw} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {([
                    { key: "currentPassword", label: "Current password" },
                    { key: "newPassword", label: "New password" },
                    { key: "confirm", label: "Confirm new password" },
                  ] as { key: keyof typeof changePwForm; label: string }[]).map(({ key, label }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>{label}</label>
                      <input
                        type="password"
                        style={{ width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)" }}
                        value={changePwForm[key]}
                        onChange={(e) => setChangePwForm((f) => ({ ...f, [key]: e.target.value }))}
                        required
                        placeholder={key === "newPassword" ? "Min 8 characters" : ""}
                      />
                    </div>
                  ))}
                  {changePwErr && <p style={{ fontSize: 13, color: "var(--color-red)", margin: 0 }}>{changePwErr}</p>}
                  <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                    <button type="button" className="btn ghost" onClick={closeChangePw} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
                    <button type="submit" className="btn primary" disabled={changePwMutation.isPending} style={{ flex: 1, justifyContent: "center", height: 40 }}>
                      {changePwMutation.isPending ? "Updating…" : "Update"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
