import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api, ApiError } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"

const OUTLET_ID_KEY   = "inbill_outlet_id"
const OUTLET_NAME_KEY = "inbill_outlet_name"

function PinDots({ length }: { length: number }) {
  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 14, height: 14, borderRadius: "50%",
            background: i < length ? "var(--color-accent)" : "var(--color-line-strong)",
            transition: "background .12s",
          }}
        />
      ))}
    </div>
  )
}

function PinKey({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault()
        const el = e.currentTarget as HTMLElement
        el.style.background = "var(--color-surface-2)"
        el.style.transform = "scale(.96)"
        onPress()
      }}
      onPointerUp={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = "var(--color-surface)"
        el.style.transform = ""
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = "var(--color-surface)"
        el.style.transform = ""
      }}
      style={{
        height: 72, borderRadius: 16,
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        fontSize: 26, fontWeight: 500,
        fontFamily: "var(--font-mono)",
        color: "var(--color-ink)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-1)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        transition: "transform .08s, background .08s",
        userSelect: "none",
      }}
    >
      {label}
      {sub && <span style={{ fontSize: 9, color: "var(--color-ink-4)", fontFamily: "var(--font-sans)", letterSpacing: ".1em", marginTop: 2 }}>{sub}</span>}
    </button>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  const savedOutletId   = localStorage.getItem(OUTLET_ID_KEY)   ?? ""
  const savedOutletName = localStorage.getItem(OUTLET_NAME_KEY) ?? "InBill"

  const [pin,     setPin]     = useState("")
  const [error,   setError]   = useState("")
  const [shake,   setShake]   = useState(false)
  const [loading, setLoading] = useState(false)

  // Outlet setup state
  const [setup,      setSetup]      = useState(!savedOutletId)
  const [outletId,   setOutletId]   = useState(savedOutletId)
  const [outletName, setOutletName] = useState(savedOutletName)
  const [code,       setCode]       = useState("")
  const [codeErr,    setCodeErr]    = useState("")
  const [saving,     setSaving]     = useState(false)

  // If the URL contains ?setup=<code> (scanned from QR in ManagerPage) and
  // no outlet is configured yet, auto-resolve the code silently.
  useEffect(() => {
    if (savedOutletId) return  // already configured — nothing to do
    const params = new URLSearchParams(window.location.search)
    const qrCode = params.get("setup")
    if (!qrCode) return
    setSaving(true)
    api.auth.resolveSetupCode(qrCode)
      .then((outlet) => {
        localStorage.setItem(OUTLET_ID_KEY,   outlet.id)
        localStorage.setItem(OUTLET_NAME_KEY, outlet.name)
        setOutletId(outlet.id)
        setOutletName(outlet.name)
        setSetup(false)
      })
      .catch(() => {
        // Bad/expired code — let captain enter it manually
        setCode(qrCode)
      })
      .finally(() => setSaving(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4) void handleLogin(pin)
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hardware keyboard support for PIN
  useEffect(() => {
    if (setup) return
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
      navigate({ to: "/floor" })
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401 ? "Incorrect PIN" : "Login failed"
      setError(msg)
      setPin("")
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setLoading(false)
    }
  }

  function press(d: string) {
    if (pin.length < 4 && !loading) {
      setError("")
      setPin((p) => p + d)
    }
  }
  function back() {
    setPin((p) => p.slice(0, -1))
    setError("")
  }

  async function resolveCode() {
    if (!code.trim()) return
    setSaving(true)
    setCodeErr("")
    try {
      const outlet = await api.auth.resolveSetupCode(code.trim())
      localStorage.setItem(OUTLET_ID_KEY,   outlet.id)
      localStorage.setItem(OUTLET_NAME_KEY, outlet.name)
      setOutletId(outlet.id)
      setOutletName(outlet.name)
      setSetup(false)
    } catch {
      setCodeErr("Invalid setup code")
    } finally {
      setSaving(false)
    }
  }

  // ── Outlet setup screen ──────────────────────────────────────────────────
  if (setup) {
    return (
      <div style={{
        height: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "24px 32px", background: "var(--color-bg)",
      }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🍽️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>InBill Captain</h1>
          <p style={{ fontSize: 14, color: "var(--color-ink-3)" }}>
            {saving ? "Connecting to outlet…" : "Enter your outlet setup code to get started"}
          </p>
        </div>

        <div style={{ width: "100%", maxWidth: 320 }}>
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeErr("") }}
            onKeyDown={(e) => e.key === "Enter" && resolveCode()}
            placeholder="Setup code (e.g. ABC-123)"
            style={{
              width: "100%", height: 52, borderRadius: 12,
              border: `1.5px solid ${codeErr ? "var(--color-red)" : "var(--color-line-strong)"}`,
              padding: "0 16px", fontSize: 16,
              fontFamily: "var(--font-mono)", letterSpacing: ".08em",
              background: "var(--color-surface)", color: "var(--color-ink)",
              outline: "none", marginBottom: codeErr ? 6 : 16,
            }}
            autoFocus
            autoCapitalize="characters"
          />
          {codeErr && (
            <p style={{ fontSize: 13, color: "var(--color-red)", marginBottom: 16, textAlign: "center" }}>{codeErr}</p>
          )}
          <button
            className="btn primary full lg"
            onClick={resolveCode}
            disabled={!code.trim() || saving}
          >
            {saving ? "Connecting…" : "Connect Outlet"}
          </button>
        </div>
      </div>
    )
  }

  // ── PIN pad ───────────────────────────────────────────────────────────────
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 24px calc(24px + var(--safe-bottom))",
      background: "var(--color-bg)",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginBottom: 4 }}>{outletName}</div>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Enter PIN</h2>
      </div>

      {/* Dots */}
      <div className={shake ? "animate-shake" : ""}>
        <PinDots length={pin.length} />
      </div>

      {error && (
        <p style={{
          fontSize: 13, color: "var(--color-red)",
          marginBottom: 16, textAlign: "center",
          minHeight: 20,
        }}>
          {error}
        </p>
      )}

      {/* Keypad */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10, width: "100%", maxWidth: 280,
        marginTop: error ? 0 : 16,
      }}>
        {keys.map((k) => (
          <PinKey key={k} label={k} onPress={() => press(k)} />
        ))}
        {/* Bottom row: change outlet | 0 | backspace */}
        <button
          onPointerDown={(e) => { e.preventDefault(); setSetup(true); setPin(""); setError("") }}
          style={{
            height: 72, borderRadius: 16, border: "none", background: "transparent",
            fontSize: 12, color: "var(--color-ink-3)", cursor: "pointer",
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          Change outlet
        </button>
        <PinKey label="0" onPress={() => press("0")} />
        <button
          onPointerDown={(e) => { e.preventDefault(); back() }}
          style={{
            height: 72, borderRadius: 16,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12H3M9 6l-6 6 6 6" />
          </svg>
        </button>
      </div>

      {loading && (
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--color-ink-3)" }}>Signing in…</p>
      )}
    </div>
  )
}
