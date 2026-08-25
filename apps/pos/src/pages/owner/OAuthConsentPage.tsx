import { useState } from "react"
import { useSearch } from "@tanstack/react-router"
import { useQuery, useMutation } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { LogoMark } from "@/components/ui/LogoMark"

export default function OAuthConsentPage() {
  const search = useSearch({ from: "/owner/oauth-consent" })
  const { client_id: clientId, client_name: clientName, redirect_uri: redirectUri, code_challenge: codeChallenge, state } = search

  const [scope, setScope] = useState<"all" | "specific">("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: outlets = [], isLoading } = useQuery({ queryKey: ["owner-outlets-consent"], queryFn: () => api.owner.outlets() })

  const approveMutation = useMutation({
    mutationFn: () =>
      api.owner.oauth.approve({
        clientId: clientId!,
        redirectUri: redirectUri!,
        codeChallenge: codeChallenge!,
        state,
        outletIds: scope === "all" ? null : Array.from(selected),
      }),
    onSuccess: (res) => { window.location.href = res.redirectUrl },
  })

  function deny() {
    if (!redirectUri) return
    const url = new URL(redirectUri)
    url.searchParams.set("error", "access_denied")
    if (state) url.searchParams.set("state", state)
    window.location.href = url.href
  }

  function toggleOutlet(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)" }}>
        <p style={{ color: "var(--color-red)", fontSize: 14 }}>This connection request is missing required parameters.</p>
      </div>
    )
  }

  const canApprove = scope === "all" || selected.size > 0

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 16 }}>
      <div style={{ width: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "var(--color-ink)" }}><LogoMark size={28} /></div>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>InBill</span>
        </div>

        <div style={{ width: "100%", background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 16, padding: 28, boxShadow: "var(--shadow-2)" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", marginBottom: 6 }}>
            {clientName ?? "An app"} wants to access your InBill data
          </div>
          <p style={{ fontSize: 13, color: "var(--color-ink-3)", lineHeight: 1.5, margin: "0 0 18px" }}>
            This grants read-only access to reports, orders, menu, and bills. It cannot make changes to your account.
          </p>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-2)", marginBottom: 8 }}>Outlets to share</div>
            {isLoading ? (
              <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--color-ink)", cursor: "pointer" }}>
                  <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
                  All outlets ({outlets.length})
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--color-ink)", cursor: "pointer" }}>
                  <input type="radio" name="scope" checked={scope === "specific"} onChange={() => setScope("specific")} />
                  Choose outlets
                </label>
                {scope === "specific" && (
                  <div style={{ marginLeft: 24, marginTop: 4, display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                    {outlets.map((o) => (
                      <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-ink-2)", cursor: "pointer" }}>
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOutlet(o.id)} />
                        {o.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {approveMutation.isError && (
            <p style={{ fontSize: 13, color: "var(--color-red)", margin: "0 0 12px" }}>{(approveMutation.error as Error).message}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={deny} style={{ flex: 1, justifyContent: "center", height: 40 }}>Deny</button>
            <button
              type="button"
              className="btn primary"
              disabled={!canApprove || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              style={{ flex: 1, justifyContent: "center", height: 40 }}
            >
              {approveMutation.isPending ? "Connecting…" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
