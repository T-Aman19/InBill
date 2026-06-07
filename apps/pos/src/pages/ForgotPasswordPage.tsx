import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@/lib/api"

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    setLoading(true)
    try {
      await api.owner.forgotPassword(email)
      setSubmitted(true)
    } catch {
      setErr("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    border: "1px solid var(--color-line-strong)",
    borderRadius: 10,
    padding: "0 14px",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    outline: "none",
    boxSizing: "border-box",
    color: "var(--color-ink)",
    background: "#fff",
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0eee9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }}>
      <div style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "var(--color-ink)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M6 2h12a1 1 0 011 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>InBill Owner</span>
        </div>

        <div style={{ width: "100%", background: "#fff", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.05)" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ width: 48, height: 48, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }}>Check your email</div>
              <p style={{ fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.5, margin: "0 0 20px" }}>
                If <strong>{email}</strong> is registered, you'll receive a password reset link within a few minutes.
              </p>
              <button
                onClick={() => navigate({ to: "/owner/login" })}
                style={{ fontSize: 13, color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-ink)" }}>Forgot password?</div>
                <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 4 }}>
                  Enter your email and we'll send a reset link.
                </div>
              </div>

              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>Email</label>
                  <input
                    type="email"
                    style={inputStyle}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {err && <p style={{ fontSize: 13, color: "var(--color-red)", margin: 0 }}>{err}</p>}

                <button
                  type="submit"
                  className="btn primary"
                  disabled={loading}
                  style={{ width: "100%", height: 44, justifyContent: "center", fontSize: 14, marginTop: 4 }}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <div style={{ borderTop: "1px solid var(--color-line)", paddingTop: 18, marginTop: 20, textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/owner/login" })}
                  style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
