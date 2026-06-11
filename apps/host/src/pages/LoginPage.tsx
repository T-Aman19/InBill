import { useState, useEffect } from "react"
import { api, ApiError } from "../lib/api"
import { ws } from "../lib/ws"

const OUTLET_ID_KEY   = "inbill_host_outlet_id"
const OUTLET_NAME_KEY = "inbill_host_outlet_name"

function PinDot({ filled, error }: { filled: boolean; error: boolean }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      background: filled ? (error ? "var(--color-red)" : "var(--color-ink)") : "transparent",
      border: `2px solid ${filled ? (error ? "var(--color-red)" : "var(--color-ink)") : "var(--color-line-strong)"}`,
      transition: "all .12s",
    }} />
  )
}

function NumKey({ d, onPress, disabled }: { d: string; onPress: (k: string) => void; disabled: boolean }) {
  return (
    <button
      onClick={() => onPress(d)}
      disabled={disabled}
      style={{
        height: 72, background: "var(--color-surface)",
        border: "1px solid var(--color-line)", borderRadius: 16,
        fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500,
        color: "var(--color-ink)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-1)", transition: "opacity .08s",
        WebkitTapHighlightColor: "transparent",
      }}
      onPointerDown={(e) => (e.currentTarget.style.opacity = ".6")}
      onPointerUp={(e)   => (e.currentTarget.style.opacity = "1")}
      onPointerLeave={(e)=> (e.currentTarget.style.opacity = "1")}
    >
      {d}
    </button>
  )
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [outletId,   setOutletId]   = useState(localStorage.getItem(OUTLET_ID_KEY) ?? "")
  const [outletName, setOutletName] = useState(localStorage.getItem(OUTLET_NAME_KEY) ?? "Restaurant")
  const [pin,     setPin]     = useState("")
  const [error,   setError]   = useState("")
  const [shake,   setShake]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [setup,   setSetup]   = useState(!localStorage.getItem(OUTLET_ID_KEY))
  const [tmpCode, setTmpCode] = useState("")
  const [setupError, setSetupError] = useState("")
  const [saving,  setSaving]  = useState(false)
  const [failCount, setFailCount] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)

  // Auto-resolve setup code from URL param (e.g. /host/?setup=DEMO01)
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("setup")
    if (param && !localStorage.getItem(OUTLET_ID_KEY)) {
      setTmpCode(param.toUpperCase())
      void autoSaveOutlet(param.toUpperCase())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function autoSaveOutlet(code: string) {
    setSaving(true)
    try {
      const res = await api.auth.resolveSetupCode(code)
      localStorage.setItem(OUTLET_ID_KEY,   res.id)
      localStorage.setItem(OUTLET_NAME_KEY, res.name)
      setOutletId(res.id)
      setOutletName(res.name)
      setSetup(false)
      // Clean up the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname)
    } catch {
      setSetupError("Invalid setup code in QR — ask your manager for a new one")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (pin.length === 4) void doLogin(pin)
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === "Backspace") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  async function doLogin(p: string) {
    if (!outletId) return
    if (lockedUntil && Date.now() < lockedUntil) {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000)
      setError(`Too many attempts — try again in ${secs}s`)
      setPin("")
      setShake(true)
      setTimeout(() => { setShake(false); setError("") }, 1200)
      return
    }
    setLoading(true)
    try {
      const res = await api.auth.login(p, outletId)
      if (res.user.role !== "host") {
        throw new Error("This PIN is not for the host app")
      }
      setFailCount(0)
      setLockedUntil(null)
      localStorage.setItem("inbill_host_token", res.token)
      ws.connect(outletId)
      onLogin()
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? "Incorrect PIN"
          : e instanceof Error
            ? e.message
            : "Login failed"
      setFailCount((n) => {
        const next = n + 1
        if (next >= 5) setLockedUntil(Date.now() + 30_000)
        return next
      })
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
  function back()  { setPin((p) => p.slice(0, -1)); setError("") }
  function clear() { setPin(""); setError("") }

  async function saveOutlet() {
    const code = tmpCode.trim()
    if (!code) return
    setSaving(true)
    setSetupError("")
    try {
      const res = await api.auth.resolveSetupCode(code)
      localStorage.setItem(OUTLET_ID_KEY,   res.id)
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

  // ── Setup screen ─────────────────────────────────────────────
  if (setup) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--color-bg)" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "var(--color-surface)", borderRadius: 20, padding: 28, boxShadow: "var(--shadow-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>InBill Host</div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>Queue management</div>
          </div>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
          Setup Code
        </label>
        <input
          value={tmpCode}
          onChange={(e) => { setTmpCode(e.target.value.toUpperCase()); setSetupError("") }}
          onKeyDown={(e) => e.key === "Enter" && void saveOutlet()}
          placeholder="e.g. CHAI4X"
          maxLength={8}
          style={{
            width: "100%", height: 56, padding: "0 16px",
            border: `1px solid ${setupError ? "var(--color-red)" : "var(--color-line-strong)"}`,
            borderRadius: 12, background: "var(--color-bg)", color: "var(--color-ink)",
            fontSize: 24, fontFamily: "var(--font-mono)", letterSpacing: ".12em",
            outline: "none", textAlign: "center",
          }}
        />
        {setupError && (
          <p style={{ fontSize: 12, color: "var(--color-red)", marginTop: 8, textAlign: "center" }}>{setupError}</p>
        )}
        <button
          onClick={() => void saveOutlet()}
          disabled={!tmpCode.trim() || saving}
          style={{
            width: "100%", height: 52, marginTop: 16,
            background: "var(--color-ink)", border: "none",
            color: "white", borderRadius: 14,
            fontSize: 16, fontWeight: 600, cursor: "pointer",
            opacity: tmpCode.trim() && !saving ? 1 : .4,
          }}
        >
          {saving ? "Verifying…" : "Continue"}
        </button>
      </div>
    </div>
  )

  // ── PIN screen ───────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", padding: 24 }}>
      <div className={shake ? "animate-shake" : ""} style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Icon */}
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--color-surface)", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "var(--shadow-1)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>

        <div style={{ fontSize: 11, color: "var(--color-ink-4)", letterSpacing: ".07em", textTransform: "uppercase", fontWeight: 600 }}>Host App</div>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 4, marginBottom: 4 }}>{outletName}</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--color-ink)", marginBottom: 28 }}>Enter your PIN</div>

        {/* PIN dots */}
        <div style={{ display: "flex", gap: 18, marginBottom: 6 }}>
          {[0, 1, 2, 3].map((i) => <PinDot key={i} filled={pin.length > i} error={!!error} />)}
        </div>
        <div style={{ height: 20, fontSize: 13, color: "var(--color-red)", fontWeight: 500, marginBottom: 20 }}>{error}</div>

        {/* Numpad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%" }}>
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <NumKey key={d} d={d} onPress={press} disabled={loading || pin.length >= 4 || (lockedUntil != null && Date.now() < lockedUntil)} />
          ))}

          <button
            onClick={clear}
            style={{ height: 72, background: "transparent", border: "1px solid var(--color-line)", borderRadius: 16, fontSize: 12, color: "var(--color-ink-3)", cursor: "pointer", fontWeight: 600, letterSpacing: ".04em" }}
          >
            CLEAR
          </button>

          <NumKey d="0" onPress={press} disabled={loading || pin.length >= 4 || (lockedUntil != null && Date.now() < lockedUntil)} />

          <button
            onClick={back}
            style={{ height: 72, background: "transparent", border: "1px solid var(--color-line)", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-2)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12H9M15 6l-6 6 6 6"/>
            </svg>
          </button>
        </div>

        <button
          onClick={() => setSetup(true)}
          style={{ marginTop: 28, fontSize: 12, color: "var(--color-ink-3)", background: "none", border: "none", cursor: "pointer" }}
        >
          Change outlet
        </button>
      </div>
    </div>
  )
}
