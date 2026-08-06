import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { api } from "@/lib/api"
import { LogoMark } from "@/components/ui/LogoMark"

type State = "verifying" | "done" | "error"

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const { token } = useSearch({ from: "/owner/verify-email" })
  const [state, setState] = useState<State>("verifying")
  const [err, setErr] = useState("")
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) { setErr("Invalid verification link — no token found"); setState("error"); return }
    api.owner.verifyEmail(token)
      .then(() => setState("done"))
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Invalid or expired verification link")
        setState("error")
      })
  }, [token])

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }}>
      <div style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "var(--color-ink)" }}>
            <LogoMark size={28} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>InBill Owner</span>
        </div>

        <div style={{ width: "100%", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "var(--shadow-2)", textAlign: "center" }}>
          {state === "verifying" && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ fontSize: 15, color: "var(--color-ink-3)" }}>Verifying your email…</div>
            </div>
          )}

          {state === "done" && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ width: 48, height: 48, background: "var(--color-surface-2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }}>Email verified</div>
              <p style={{ fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.5, margin: "0 0 20px" }}>
                You're all set — you can now add your first outlet.
              </p>
              <button
                className="btn primary"
                onClick={() => navigate({ to: "/owner/dashboard" })}
                style={{ width: "100%", height: 44, justifyContent: "center", fontSize: 14 }}
              >
                Go to dashboard
              </button>
            </div>
          )}

          {state === "error" && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ width: 48, height: 48, background: "var(--color-red-soft)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 8 }}>Couldn't verify</div>
              <p style={{ fontSize: 13, color: "var(--color-red)", lineHeight: 1.5, margin: "0 0 20px" }}>{err}</p>
              <button
                className="btn primary"
                onClick={() => navigate({ to: "/owner/dashboard" })}
                style={{ width: "100%", height: 44, justifyContent: "center", fontSize: 14 }}
              >
                Go to dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
