import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, SERVER_ORIGIN } from "@/lib/api"
import { LogoMark } from "@/components/ui/LogoMark"

// SERVER_ORIGIN (not window.location.origin) so this is correct in Vite dev
// too, where the UI (5173) and API server (3000) aren't the same origin —
// in both real deployments (cloud custom domain, local Tauri desktop) the
// server serves the built SPA itself, so the two coincide anyway.
const MCP_URL = `${SERVER_ORIGIN || window.location.origin}/mcp`

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      style={{ height: 30, padding: "0 10px", fontSize: 12 }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

export default function OwnerIntegrationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [label, setLabel] = useState("")
  const [newKey, setNewKey] = useState<string | null>(null)

  const { data: me } = useQuery({ queryKey: ["owner-me"], queryFn: api.owner.me })
  const { data: keys = [], isLoading: keysLoading } = useQuery({ queryKey: ["mcp-keys"], queryFn: api.owner.mcpKeys.list })
  // OAuth (and its /api/oauth/grants endpoint) only exists in cloud mode — see
  // routes/oauth.ts. Gating the query itself (not just the rendered section)
  // avoids a 404 hitting the console on every load of a local/self-hosted install.
  const { data: grants = [], isLoading: grantsLoading } = useQuery({
    queryKey: ["oauth-grants"],
    queryFn: api.owner.oauth.grants,
    enabled: !!me?.isCloud,
  })

  const createMutation = useMutation({
    mutationFn: () => api.owner.mcpKeys.create(label.trim()),
    onSuccess: (res) => {
      setNewKey(res.key)
      setLabel("")
      qc.invalidateQueries({ queryKey: ["mcp-keys"] })
    },
  })

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => api.owner.mcpKeys.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-keys"] }),
  })

  const revokeGrantMutation = useMutation({
    mutationFn: (clientId: string) => api.owner.oauth.revokeGrant(clientId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth-grants"] }),
  })

  function closeCreate() {
    setShowCreate(false)
    setLabel("")
    setNewKey(null)
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
      <header style={{ height: 64, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 28px", gap: 12, flexShrink: 0 }}>
        <button
          className="btn ghost"
          onClick={() => navigate({ to: "/owner/dashboard" })}
          style={{ padding: "0 10px", height: 34, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          Dashboard
        </button>
        <div style={{ width: 1, height: 22, background: "var(--color-line)", margin: "0 4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: "var(--color-ink)", flexShrink: 0 }}><LogoMark size={24} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>Integrations</span>
        </div>
      </header>

      <main style={{ padding: 32, overflow: "auto", flex: 1 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)", margin: "0 0 6px" }}>Connect an AI app</h2>
            <p style={{ fontSize: 13.5, color: "var(--color-ink-3)", lineHeight: 1.5, margin: 0 }}>
              InBill exposes a read-only Model Context Protocol (MCP) server so Claude, ChatGPT, or any other MCP-compatible app can answer questions about your sales, menu, and orders.{" "}
              {me?.isCloud
                ? "In claude.ai, paste the URL below and click Connect — you'll sign in and approve access from there. For clients that need a manual bearer token instead (Claude Code, Claude Desktop's custom server config), generate an API key below."
                : "Self-hosted installs use a manual bearer token — generate an API key below and paste it into your AI client's MCP server config (e.g. Claude Code, Claude Desktop)."}
            </p>
          </div>

          <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8 }}>Server URL</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--color-surface-2)", borderRadius: 8, padding: "8px 12px", overflow: "auto", whiteSpace: "nowrap" }}>{MCP_URL}</code>
              <CopyButton text={MCP_URL} />
            </div>
          </div>

          {/* Connected apps (OAuth) — cloud only, OAuth isn't available in local/self-hosted mode */}
          {me?.isCloud && (
          <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 600, color: "var(--color-ink)", margin: "0 0 12px" }}>Connected apps</h3>
            {grantsLoading ? (
              <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Loading…</p>
            ) : grants.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Nothing connected yet — paste the server URL into claude.ai to get started.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {grants.map((g, i) => (
                  <div key={g.clientId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--color-line)" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink)" }}>{g.clientName}</div>
                      {g.grantedAt && <div style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>Connected {fmtDate(g.grantedAt)}</div>}
                    </div>
                    <button
                      className="btn ghost"
                      disabled={revokeGrantMutation.isPending}
                      onClick={() => { if (confirm(`Disconnect ${g.clientName}? It will lose access immediately.`)) revokeGrantMutation.mutate(g.clientId) }}
                      style={{ height: 30, padding: "0 10px", fontSize: 12, color: "var(--color-red)" }}
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Static API keys */}
          <div className="card" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h3 style={{ fontSize: 14.5, fontWeight: 600, color: "var(--color-ink)", margin: 0, flex: 1 }}>API keys</h3>
              <button className="btn primary" onClick={() => setShowCreate(true)} style={{ height: 32, fontSize: 12.5 }}>+ Generate key</button>
            </div>
            {keysLoading ? (
              <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>Loading…</p>
            ) : keys.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-ink-3)" }}>No keys yet. Generate one to use InBill's MCP server with clients that take a manual bearer token.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {keys.map((k, i) => (
                  <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? "1px solid var(--color-line)" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink)" }}>{k.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--color-ink-3)", fontFamily: "var(--font-mono)" }}>
                        {k.keyPrefix}… · created {fmtDate(k.createdAt)}{k.lastUsedAt ? ` · last used ${fmtDate(k.lastUsedAt)}` : ""}
                      </div>
                    </div>
                    {k.revokedAt ? (
                      <span style={{ fontSize: 11.5, color: "var(--color-ink-3)" }}>Revoked</span>
                    ) : (
                      <button
                        className="btn ghost"
                        disabled={revokeKeyMutation.isPending}
                        onClick={() => { if (confirm(`Revoke "${k.label}"? Any client using this key will stop working immediately.`)) revokeKeyMutation.mutate(k.id) }}
                        style={{ height: 30, padding: "0 10px", fontSize: 12, color: "var(--color-red)" }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 18, boxShadow: "var(--shadow-3)", width: "100%", maxWidth: 440, padding: 28 }}>
            {newKey ? (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 8px" }}>Key created</h2>
                <p style={{ fontSize: 13, color: "var(--color-ink-3)", margin: "0 0 14px", lineHeight: 1.5 }}>
                  Copy this key now — for your security, it won't be shown again.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12.5, background: "var(--color-surface-2)", borderRadius: 8, padding: "10px 12px", overflow: "auto", wordBreak: "break-all" }}>{newKey}</code>
                  <CopyButton text={newKey} />
                </div>
                <button className="btn primary" onClick={closeCreate} style={{ width: "100%", height: 40, justifyContent: "center" }}>Done</button>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--color-ink)", margin: "0 0 20px" }}>Generate API key</h2>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-ink-2)", marginBottom: 5 }}>Label</label>
                <input
                  autoFocus
                  style={{ width: "100%", height: 42, border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box", color: "var(--color-ink)", marginBottom: 20 }}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Claude Desktop"
                  maxLength={100}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn ghost" onClick={closeCreate} style={{ flex: 1, justifyContent: "center", height: 40 }}>Cancel</button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!label.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                    style={{ flex: 1, justifyContent: "center", height: 40 }}
                  >
                    {createMutation.isPending ? "Generating…" : "Generate"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
