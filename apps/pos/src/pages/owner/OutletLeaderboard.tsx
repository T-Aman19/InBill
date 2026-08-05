import type { OwnerOutlet } from "@/lib/api"
import { Sparkline } from "@/components/charts/Sparkline"
import { formatCurrencyInt } from "@/lib/utils"

export type LeaderboardRow = OwnerOutlet & { rank: number; share: number; deltaPct: number; color: string }

const th: React.CSSProperties = {
  fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-ink-4)",
  fontWeight: 600, padding: "0 10px 10px", borderBottom: "1px solid var(--color-line)", textAlign: "left",
}
const td: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid var(--color-line)", verticalAlign: "middle" }

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct >= 0
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: up ? "var(--color-green)" : "var(--color-red)" }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {up ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
      </svg>
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export function OutletLeaderboard({ rows, sparklines, onOpenSettings, onSwitch }: {
  rows: LeaderboardRow[]
  sparklines: Record<string, number[]>
  onOpenSettings: (outletId: string) => void
  onSwitch: (outletId: string) => void
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}></th>
            <th style={th}>Outlet</th>
            <th style={th}>7-day trend</th>
            <th style={{ ...th, textAlign: "right" }}>Revenue</th>
            <th style={th}>Share</th>
            <th style={{ ...th, textAlign: "right" }}>vs last period</th>
            <th style={{ ...th, textAlign: "right" }}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="owner-lb-row">
              <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-3)", width: 22 }}>#{r.rank}</td>
              <td style={td}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color, flexShrink: 0, display: "inline-block" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-ink)" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>{r.address}</div>
                  </div>
                </div>
              </td>
              <td style={td}>
                <div style={{ width: 84, height: 26 }}>
                  <Sparkline values={sparklines[r.id] ?? []} color={r.color} />
                </div>
              </td>
              <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 600, color: "var(--color-ink)" }}>
                {formatCurrencyInt(r.revenue)}
              </td>
              <td style={td}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--color-surface-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, width: `${r.share.toFixed(0)}%`, background: r.color }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-ink-3)", width: 30, textAlign: "right" }}>{r.share.toFixed(0)}%</span>
                </div>
              </td>
              <td style={{ ...td, textAlign: "right" }}><DeltaBadge pct={r.deltaPct} /></td>
              <td style={{ ...td, textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => onOpenSettings(r.id)}
                    title="Outlet settings"
                    style={{ width: 28, height: 28, borderRadius: 8, background: "transparent", border: "1px solid var(--color-line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)", cursor: "pointer", flexShrink: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSwitch(r.id)}
                    className="owner-lb-open"
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent-ink)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Open POS →
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
