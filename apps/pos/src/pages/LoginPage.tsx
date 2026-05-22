import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"

const OUTLET_ID_KEY   = "inbill_outlet_id"
const OUTLET_NAME_KEY = "inbill_outlet_name"

export default function LoginPage() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  const [outletId,   setOutletId]   = useState(localStorage.getItem(OUTLET_ID_KEY) ?? "")
  const [outletName, setOutletName] = useState(localStorage.getItem(OUTLET_NAME_KEY) ?? "InBill POS")
  const [pin,     setPin]     = useState("")
  const [error,   setError]   = useState("")
  const [shake,   setShake]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [setup,      setSetup]      = useState(!localStorage.getItem(OUTLET_ID_KEY))
  const [tmpCode,    setTmpCode]    = useState("")
  const [setupError, setSetupError] = useState("")
  const [saving,     setSaving]     = useState(false)

  // Auto-submit on 4th digit
  useEffect(() => {
    if (pin.length === 4) void handleLogin(pin)
  }, [pin])

  // Hardware keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === "Backspace") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  async function handleLogin(p: string) {
    if (!outletId) return
    setLoading(true)
    try {
      const res = await api.auth.login(p, outletId)
      login(res.token, res.user, outletId, outletName)
      navigate({ to: res.user.role === "kitchen" ? "/kds" : "/floor" })
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401 ? "Incorrect PIN" : "Login failed"
      setError(msg)
      setPin("")
      setShake(true)
      setTimeout(() => { setShake(false); setError("") }, 1200)
    } finally {
      setLoading(false)
    }
  }

  function press(d: string) {
    if (loading || pin.length >= 4) return
    setError("")
    setPin((p) => p + d)
  }

  function back() { setPin((p) => p.slice(0, -1)); setError("") }
  function clear() { setPin(""); setError("") }

  async function saveOutlet() {
    const code = tmpCode.trim()
    if (!code) return
    setSaving(true)
    setSetupError("")
    try {
      const res = await api.auth.resolveSetupCode(code)
      localStorage.setItem(OUTLET_ID_KEY, res.id)
      localStorage.setItem(OUTLET_NAME_KEY, res.name)
      setOutletId(res.id)
      setOutletName(res.name)
      setSetup(false)
    } catch {
      setSetupError("Invalid setup code — check with your manager")
    } finally {
      setSaving(false)
    }
  }

  // ── Setup screen ────────────────────────────────────────────
  if (setup) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <div style={{ width: 420, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 32, boxShadow: "var(--shadow-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-bg)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>Setup InBill</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>Enter the setup code shown in your Owner Dashboard</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Setup Code</label>
          <input
            value={tmpCode}
            onChange={(e) => { setTmpCode(e.target.value.toUpperCase()); setSetupError("") }}
            onKeyDown={(e) => e.key === "Enter" && void saveOutlet()}
            placeholder="e.g. CHAI4X"
            maxLength={8}
            style={{
              width: "100%", height: 52, padding: "0 14px",
              border: "1px solid var(--color-line-strong)", borderRadius: 10,
              background: "var(--color-bg)", color: "var(--color-ink)",
              fontSize: 22, fontFamily: "var(--font-mono)", letterSpacing: ".12em",
              outline: "none", textAlign: "center",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")}
            onBlur={(e)  => (e.currentTarget.style.borderColor = setupError ? "var(--color-red)" : "var(--color-line-strong)")}
          />
        </div>

        {setupError && (
          <p style={{ fontSize: 12, color: "var(--color-red)", marginBottom: 12, textAlign: "center" }}>{setupError}</p>
        )}

        <button
          onClick={() => void saveOutlet()}
          disabled={!tmpCode.trim() || saving}
          style={{
            width: "100%", height: 48,
            background: "var(--color-ink)", border: "none",
            color: "var(--color-bg)", borderRadius: 12,
            fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            cursor: tmpCode.trim() && !saving ? "pointer" : "not-allowed",
            opacity: tmpCode.trim() && !saving ? 1 : .4,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {saving ? "Verifying…" : "Continue"}
          {!saving && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}
        </button>
      </div>
    </div>
  )

  // ── Main login ───────────────────────────────────────────────
  const Key = ({ d, sub }: { d: string; sub?: string }) => (
    <button
      onClick={() => press(d)}
      disabled={loading || pin.length >= 4}
      style={{
        height: 76,
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: 16,
        fontFamily: "var(--font-mono)",
        fontSize: 28, fontWeight: 500,
        color: "var(--color-ink)",
        cursor: "pointer",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-1)",
        transition: "all .08s",
        userSelect: "none",
      }}
      onMouseDown={(e)  => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)"; }}
      onMouseUp={(e)    => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface)"; (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface)"; (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
    >
      {d}
      {sub && <span style={{ fontSize: 9, color: "var(--color-ink-4)", fontFamily: "var(--font-sans)", letterSpacing: ".1em", marginTop: 2 }}>{sub}</span>}
    </button>
  )

  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr", overflow: "hidden" }}>
      {/* Left: brand panel */}
      <div style={{
        background: "linear-gradient(160deg, oklch(28% 0.04 55), oklch(22% 0.02 55))",
        color: "oklch(96% 0.02 70)",
        display: "flex", flexDirection: "column",
        padding: "48px 56px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative blobs */}
        <div style={{ position: "absolute", inset: 0, opacity: .12, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle at 20% 90%, oklch(70% 0.15 55) 0, transparent 40%), radial-gradient(circle at 90% 10%, oklch(70% 0.15 55) 0, transparent 50%)" }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "oklch(20% 0.05 55)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z"/></svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.01em" }}>InBill</span>
        </div>

        {/* Bottom copy */}
        <div style={{ marginTop: "auto", position: "relative" }}>
          <div style={{ fontSize: 13, color: "oklch(72% 0.02 70)", letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 10 }}>Outlet</div>
          <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-.02em" }}>{outletName}</div>

          <div style={{ display: "flex", gap: 24, marginTop: 32, fontSize: 12, color: "oklch(72% 0.02 70)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(70% 0.15 145)" }} />
              Local network
            </span>
            <span>Terminal 01</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>

      {/* Right: PIN pad */}
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40,
        background: "var(--color-bg)",
      }}>
        <div className={shake ? "animate-shake" : ""} style={{ width: 360, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 500 }}>Welcome back</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 8, color: "var(--color-ink)" }}>Enter your PIN</div>

          {/* PIN dots */}
          <div style={{ display: "flex", gap: 16, marginTop: 28, marginBottom: 8, alignItems: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: "50%",
                background: pin.length > i ? (error ? "var(--color-red)" : "var(--color-ink)") : "transparent",
                border: "2px solid " + (pin.length > i ? (error ? "var(--color-red)" : "var(--color-ink)") : "var(--color-line-strong)"),
                transition: "all .15s",
              }} />
            ))}
          </div>
          <div style={{ height: 18, fontSize: 12, color: "var(--color-red)", fontWeight: 500 }}>{error}</div>

          {/* Numpad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", marginTop: 16 }}>
            {["1","2","3","4","5","6","7","8","9"].map((d) => <Key key={d} d={d} />)}

            {/* Clear */}
            <button onClick={clear} style={{
              height: 76, background: "transparent",
              border: "1px solid var(--color-line)",
              borderRadius: 16, fontSize: 12, color: "var(--color-ink-3)",
              cursor: "pointer", fontWeight: 500, letterSpacing: ".04em",
              fontFamily: "var(--font-sans)",
            }}>CLEAR</button>

            <Key d="0" />

            {/* Backspace */}
            <button onClick={back} style={{
              height: 76, background: "transparent",
              border: "1px solid var(--color-line)",
              borderRadius: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-ink-2)",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          </div>

          <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", width: "100%", fontSize: 12, color: "var(--color-ink-3)" }}>
            <button onClick={() => setSetup(true)} style={{ background: "none", border: "none", color: "var(--color-ink-3)", cursor: "pointer", fontSize: 12, padding: 0 }}>
              Change outlet
            </button>
            {loading && <span>Checking…</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
