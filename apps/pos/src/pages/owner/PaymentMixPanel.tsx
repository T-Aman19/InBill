import { formatCurrencyInt } from "@/lib/utils"

const MODES: { key: string; label: string; color: string }[] = [
  { key: "upi", label: "UPI", color: "var(--color-cat-3)" },
  { key: "cash", label: "Cash", color: "var(--color-ink-4)" },
  { key: "card", label: "Card", color: "var(--color-cat-2)" },
  { key: "razorpay", label: "Razorpay", color: "var(--color-cat-1)" },
]

export function PaymentMixPanel({ byPaymentMode }: { byPaymentMode: Record<string, number> }) {
  const total = Object.values(byPaymentMode).reduce((s, v) => s + v, 0)
  const segments = MODES
    .map((m) => ({ ...m, amount: byPaymentMode[m.key] ?? 0 }))
    .filter((m) => m.amount > 0)

  if (total === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--color-ink-3)" }}>No payments recorded for this range yet.</p>
  }

  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, marginBottom: 14 }}>
        {segments.map((m) => (
          <div key={m.key} style={{ height: "100%", width: `${((m.amount / total) * 100).toFixed(1)}%`, background: m.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {segments.map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: m.color, flexShrink: 0, display: "inline-block" }} />
            {m.label}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-3)", marginLeft: 2 }}>
              {formatCurrencyInt(m.amount)} · {((m.amount / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
