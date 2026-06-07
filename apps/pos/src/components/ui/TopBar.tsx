import React, { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/stores/auth"
import { api } from "@/lib/api"

type NavId = "floor" | "kds" | "manager" | "inventory"

interface Stats { free: number; open: number; billed: number }

interface Props {
  current: NavId
  stats?: Stats
  onTakeaway?: () => void
  onDelivery?: () => void
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").filter(Boolean).slice(0, 2).join("").toUpperCase()
}

export function TopBar({ current, stats, onTakeaway, onDelivery }: Props) {
  const navigate = useNavigate()
  const { user, outletName, setupCode, logout } = useAuthStore()
  const [copied, setCopied] = useState(false)

  function copyCode() {
    if (!displaySetupCode) return
    navigator.clipboard.writeText(displaySetupCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const isManagerOrOwner = user?.role === "manager" || user?.role === "owner"

  const { data: lowStockData } = useQuery<{ count: number }>({
    queryKey: ["low-stock-count"],
    queryFn: () => api.inventory.lowStockCount(),
    enabled: isManagerOrOwner,
    refetchInterval: 60_000,
  })
  const lowStockCount = lowStockData?.count ?? 0

  const { data: outletData } = useQuery({
    queryKey: ["outlet-info"],
    queryFn: () => api.outlet.get(),
    enabled: isManagerOrOwner,
    staleTime: Infinity,
  })
  const displaySetupCode = setupCode ?? outletData?.setupCode ?? null

  const nav = (to: NavId) => () => {
    const paths: Record<NavId, string> = { floor: "/floor", kds: "/kds", manager: "/manager", inventory: "/inventory" }
    navigate({ to: paths[to] })
  }

  return (
    <div style={{
      height: 64, flexShrink: 0,
      background: "var(--color-surface)",
      borderBottom: "1px solid var(--color-line)",
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 20,
    }}>
      {/* Logo + outlet */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "var(--color-ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--color-bg)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm2 4h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.1, color: "var(--color-ink)" }}>{outletName}</div>
          {displaySetupCode ? (
            <button
              onClick={copyCode}
              title={copied ? "Copied!" : "Click to copy setup code"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "none", border: "none", padding: 0,
                cursor: "pointer", color: "inherit",
              }}
            >
              <span style={{
                fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: ".06em",
                color: copied ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                fontWeight: 500,
                transition: "color .15s",
              }}>
                {copied ? "Copied!" : displaySetupCode}
              </span>
              {!copied && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-ink-4)", flexShrink: 0 }}>
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              )}
            </button>
          ) : (
            <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>Terminal 01</div>
          )}
        </div>
      </div>

      {/* Live stats pill */}
      {stats && (
        <div style={{
          display: "flex", gap: 0, marginLeft: 8,
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-line)",
          borderRadius: 10, padding: 4,
        }}>
          {([
            { k: "free",   label: "Free",   dot: "green", val: stats.free },
            { k: "open",   label: "Open",   dot: "amber", val: stats.open },
            { k: "billed", label: "Billed", dot: "red",   val: stats.billed },
          ] as const).map((s, i, arr) => (
            <div key={s.k} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px",
              borderRight: i < arr.length - 1 ? "1px solid var(--color-line)" : "none",
              fontSize: 12,
            }}>
              <span className={`dot ${s.dot}`} />
              <span style={{ color: "var(--color-ink-3)" }}>{s.label}</span>
              <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{s.val}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Nav */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {onTakeaway && (
          <button onClick={onTakeaway} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "8px 14px", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z"/><path d="M8 8V6a4 4 0 018 0v2"/><path d="M9 13h6"/>
            </svg>
            Takeaway
          </button>
        )}
        {onDelivery && (
          <button onClick={onDelivery} style={{ background: "var(--color-surface)", border: "1px solid var(--color-line-strong)", borderRadius: 10, padding: "8px 14px", color: "var(--color-ink)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8h14M8 8V6a4 4 0 018 0v2"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M12 12v4M10 14h4"/>
            </svg>
            Delivery
          </button>
        )}

        {(["floor", "kds", "manager", "inventory"] as const)
          .filter((id) => id !== "manager" || isManagerOrOwner)
          .filter((id) => id !== "inventory" || isManagerOrOwner)
          .filter((id) => id !== "floor" || user?.role !== "kitchen")
          .filter((id) => id !== "kds" || user?.role !== "kitchen")
          .map((id) => {
            const labels: Record<NavId, string> = { floor: "Floor", kds: "Kitchen", manager: "Manager", inventory: "Inventory" }
            const icons: Record<NavId, React.ReactElement> = {
              floor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>,
              kds:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M3 8h18M7 12h4M7 14h7"/><path d="M9 17v3M15 17v3M6 20h12"/></svg>,
              manager: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.8a7 7 0 00-2-1.2L14 3h-4l-.6 2.5a7 7 0 00-2 1.2L5.1 5.9l-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.8a7 7 0 002 1.2L10 21h4l.6-2.5a7 7 0 002-1.2l2.3.8 2-3.4-2-1.5c0-.4.1-.8.1-1.2z"/></svg>,
              inventory: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v2"/><path d="M3 8h18v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><path d="M10 12h4M10 16h4M8 12v.01M8 16v.01"/></svg>,
            }
            const active = current === id
            return (
              <button key={id} onClick={nav(id)} style={{
                background: active ? "var(--color-surface-2)" : "transparent",
                border: "1px solid " + (active ? "var(--color-line)" : "transparent"),
                color: active ? "var(--color-ink)" : "var(--color-ink-3)",
                borderRadius: 10, padding: "8px 12px",
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 13, fontWeight: 500,
                transition: "all .1s",
                position: "relative",
              }}>
                {icons[id]}
                {labels[id]}
                {id === "inventory" && lowStockCount > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px", lineHeight: 1.4 }}>{lowStockCount}</span>
                )}
              </button>
            )
          })}
      </div>

      {/* User */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        paddingLeft: 16, borderLeft: "1px solid var(--color-line)",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--color-accent-soft)", color: "var(--color-accent-ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600,
        }}>
          {initials(user?.name ?? "?")}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, color: "var(--color-ink)" }}>{user?.name}</div>
          <div style={{ fontSize: 10, color: "var(--color-ink-3)", textTransform: "capitalize" }}>{user?.role}</div>
        </div>
        <button
          onClick={() => { logout(); navigate({ to: "/login" }) }}
          title="Logout"
          style={{
            background: "transparent", border: "none",
            color: "var(--color-ink-3)",
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .1s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
