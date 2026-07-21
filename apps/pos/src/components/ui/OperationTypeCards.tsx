export type OperationType = "full_service" | "quick_service" | "cloud_kitchen"

const OPTIONS: { id: OperationType; title: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "full_service",
    title: "Full-Service Restaurant",
    description: "Floor page with tables & seating. Orders go to a Kitchen display (KDS) — billing is blocked until food is marked ready.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="11" rx="1.5"/><path d="M3 11h18M7 17v3M17 17v3"/></svg>
    ),
  },
  {
    id: "quick_service",
    title: "Quick Service / Counter",
    description: "No tables, no Kitchen tab. Take the order and charge immediately, like a billing counter.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M2 12h20"/></svg>
    ),
  },
  {
    id: "cloud_kitchen",
    title: "Cloud Kitchen / Delivery",
    description: "No tables, but keeps the Kitchen tab — orders still get a kitchen ticket for delivery/takeaway prep.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l-1.5 12a2 2 0 01-2 2h-9a2 2 0 01-2-2L5 8z"/><path d="M8 8V6a4 4 0 018 0v2"/><path d="M9 13h6"/></svg>
    ),
  },
]

export function operationTypeFromSettings(settings?: { hasTables?: boolean; hasKitchenWorkflow?: boolean }): OperationType {
  const hasTables = settings?.hasTables !== false
  const hasKitchenWorkflow = settings?.hasKitchenWorkflow !== false
  if (hasTables) return "full_service"
  return hasKitchenWorkflow ? "cloud_kitchen" : "quick_service"
}

export function operationTypeToSettings(type: OperationType): { hasTables: boolean; hasKitchenWorkflow: boolean } {
  if (type === "full_service") return { hasTables: true, hasKitchenWorkflow: true }
  if (type === "cloud_kitchen") return { hasTables: false, hasKitchenWorkflow: true }
  return { hasTables: false, hasKitchenWorkflow: false }
}

export function OperationTypeCards({ value, onChange }: { value: OperationType; onChange: (t: OperationType) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {OPTIONS.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
              padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: "1.5px solid " + (active ? "var(--color-ink)" : "var(--color-line-strong)"),
              background: active ? "var(--color-surface-2)" : "var(--color-surface)",
              fontFamily: "inherit",
            }}
          >
            <div style={{ color: active ? "var(--color-ink)" : "var(--color-ink-3)", marginTop: 1, flexShrink: 0 }}>{o.icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>{o.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-ink-3)", marginTop: 2, lineHeight: 1.4 }}>{o.description}</div>
            </div>
          </button>
        )
      })}
      <div style={{ fontSize: 11, color: "var(--color-ink-4)", marginTop: 2 }}>
        You can change this anytime from Manager → Outlet settings.
      </div>
    </div>
  )
}
