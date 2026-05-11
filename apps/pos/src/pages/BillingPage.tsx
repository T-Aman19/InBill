import { useQuery, useMutation } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { TopBar } from "@/components/ui/TopBar"

type TaxLine = { name: string; rate: number; amount: number }
type Payment = { id: string; mode: string; amount: string }
type BillItem = { name: string; quantity: number; unitPrice: string; isVeg?: boolean }
type Bill = {
  id: string; billNumber: number; subtotal: string; taxLines: TaxLine[]
  taxTotal: string; discountAmount: string; total: string; isPaid: boolean
  payments: Payment[]; items?: BillItem[]
}
type OutletInfo = { name: string; address: string; gstin?: string }

const PAYMENT_MODES = [
  { id: "cash", label: "Cash",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M5 10v.01M19 15v.01"/></svg> },
  { id: "card", label: "Card",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20M6 16h3"/></svg> },
  { id: "upi", label: "UPI",
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l-6 16M9 4l-2 8h6l-2 8"/></svg> },
] as const

function Row({ label, value, dim, big }: { label: string; value: string; dim?: boolean; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: big ? "4px 0" : "3px 0", fontSize: big ? 18 : 13, fontWeight: big ? 600 : 400, color: dim ? "var(--color-ink-3)" : "var(--color-ink)" }}>
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  )
}

export default function BillingPage() {
  const { billId } = useParams({ from: "/billing/$billId" })
  const navigate   = useNavigate()
  const [mode,     setMode]     = useState<"cash" | "card" | "upi">("cash")
  const [tendered, setTendered] = useState("")

  const { data: bill, refetch } = useQuery({
    queryKey: ["bill", billId],
    queryFn: () => api.bills.get(billId) as Promise<Bill>,
  })

  const { data: outlet } = useQuery({
    queryKey: ["outlet"],
    queryFn: () => api.outlet.get() as Promise<OutletInfo>,
    staleTime: 5 * 60 * 1000,
  })

  const payMutation = useMutation({
    mutationFn: (amount: number) => api.bills.addPayment(billId, { mode, amount }),
    onSuccess: () => { refetch(); setTendered("") },
  })

  if (!bill) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)" }}>
      <div style={{ color: "var(--color-ink-3)" }}>Loading bill…</div>
    </div>
  )

  const paidTotal      = bill.payments.reduce((s, p) => s + Number(p.amount), 0)
  const remaining      = Math.max(0, Number(bill.total) - paidTotal)
  const collectAmt     = tendered ? parseFloat(tendered) || 0 : remaining
  const change         = mode === "cash" && tendered && parseFloat(tendered) >= remaining
                           ? parseFloat(tendered) - remaining
                           : 0

  function handleCollect() {
    const amount = Math.min(collectAmt, remaining)
    if (amount <= 0) return
    payMutation.mutate(amount)
  }

  // Paid success state
  if (bill.isPaid) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
      {/* Receipt — hidden on screen, visible when printing */}
      <div className="print-receipt" style={{ display: "none" }}>
        <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "1px dashed #aaa" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{outlet?.name ?? "InBill"}</div>
          {outlet?.address && <div style={{ fontSize: 11, marginTop: 2 }}>{outlet.address}</div>}
          {outlet?.gstin && <div style={{ fontSize: 11, marginTop: 2 }}>GSTIN {outlet.gstin}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 11 }}>
          <span>Bill #{bill.billNumber}</span>
          <span>{new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
        </div>
        {bill.items && bill.items.length > 0 && (
          <div style={{ borderTop: "1px solid #aaa", borderBottom: "1px solid #aaa" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 80px", padding: "8px 0", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
              <span>Item</span><span style={{ textAlign: "center" }}>Qty</span><span style={{ textAlign: "right" }}>Amt</span>
            </div>
            {bill.items.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 40px 80px", padding: "6px 0", fontSize: 12, borderTop: "1px solid #ddd" }}>
                <span>{l.name}</span>
                <span style={{ textAlign: "center" }}>{l.quantity}</span>
                <span style={{ textAlign: "right" }}>{formatCurrency(Number(l.unitPrice) * l.quantity)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ paddingTop: 12, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{formatCurrency(bill.subtotal)}</span></div>
          {Number(bill.discountAmount) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount</span><span>-{formatCurrency(bill.discountAmount)}</span></div>}
          {bill.taxLines.map((line, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{line.name} ({line.rate}%)</span><span>{formatCurrency(line.amount)}</span></div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid #aaa", marginTop: 8, paddingTop: 8 }}><span>Total</span><span>{formatCurrency(bill.total)}</span></div>
        </div>
        {bill.payments.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed #aaa", fontSize: 11 }}>
            {bill.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ textTransform: "capitalize" }}>{p.mode}</span>
                <span>{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11 }}>Thank you for visiting!</div>
      </div>

      <TopBar current="floor" />
      <div className="animate-fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }}>
        <div className="animate-pop" style={{
          width: 96, height: 96, borderRadius: "50%",
          background: "var(--color-green-soft)", color: "var(--color-green)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
        </div>

        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.01em" }}>Payment received</div>
        <div style={{ fontSize: 16, color: "var(--color-ink-3)", marginTop: 6 }}>
          {formatCurrency(bill.total)} collected · Bill #{bill.billNumber}
        </div>

        {bill.payments.length > 0 && (
          <div style={{ display: "flex", gap: 18, marginTop: 20, fontSize: 13, color: "var(--color-ink-3)" }}>
            {bill.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ textTransform: "capitalize" }}>{p.mode}</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
          <button onClick={() => navigate({ to: "/floor" })} style={{
            padding: "16px 28px", borderRadius: 12,
            background: "var(--color-ink)", border: "none",
            color: "var(--color-bg)", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}>
            Back to floor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          <button onClick={() => window.print()} style={{
            padding: "16px 24px", borderRadius: 12,
            background: "var(--color-surface)", border: "1px solid var(--color-line-strong)",
            color: "var(--color-ink)", fontSize: 15, fontFamily: "inherit", cursor: "pointer",
          }}>
            Print receipt
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)" }}>
      <TopBar current="floor" />

      {/* Sub-header */}
      <div style={{
        height: 56, flexShrink: 0,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-line)",
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 16,
      }}>
        <button onClick={() => navigate({ to: "/floor" })} style={{
          background: "transparent", border: "none",
          color: "var(--color-ink-2)", padding: 8, borderRadius: 8, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
          onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Bill #{bill.billNumber}</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>
          {new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </span>
        <button onClick={() => window.print()} title="Print receipt" style={{
          background: "transparent", border: "none",
          color: "var(--color-ink-3)", padding: 8, borderRadius: 8, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 440px", overflow: "hidden" }}>
        {/* Left: receipt */}
        <div className="scroll print-receipt" style={{ padding: "24px 32px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            {/* Outlet header */}
            <div style={{ textAlign: "center", paddingBottom: 18, borderBottom: "1px dashed var(--color-line-strong)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{outlet?.name ?? "InBill"}</div>
              {outlet?.address && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>{outlet.address}</div>}
              {outlet?.gstin && <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2 }}>GSTIN {outlet.gstin}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", fontSize: 12, color: "var(--color-ink-3)" }}>
              <span>Bill #{bill.billNumber}</span>
              <span>{new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            </div>

            {/* Items table */}
            {bill.items && bill.items.length > 0 && (
              <div style={{ borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", padding: "10px 0", fontSize: 11, color: "var(--color-ink-3)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 500 }}>
                  <span /><span>Item</span><span style={{ textAlign: "center" }}>Qty</span><span style={{ textAlign: "right" }}>Amount</span>
                </div>
                {bill.items.map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr 52px 100px", padding: "10px 0", fontSize: 14, alignItems: "center", borderTop: "1px solid var(--color-line)" }}>
                    <span className={`veg-dot ${l.isVeg ? "veg" : "nonveg"}`} style={{ width: 10, height: 10 }} />
                    <span style={{ color: "var(--color-ink)" }}>{l.name}</span>
                    <span style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--color-ink-2)" }}>{l.quantity}</span>
                    <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 500 }}>{formatCurrency(Number(l.unitPrice) * l.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div style={{ paddingTop: 16 }}>
              <Row label="Subtotal" value={formatCurrency(bill.subtotal)} />
              {Number(bill.discountAmount) > 0 && (
                <Row label="Discount" value={"− " + formatCurrency(bill.discountAmount)} dim />
              )}
              {bill.taxLines.map((line, i) => (
                <Row key={i} label={`${line.name} (${line.rate}%)`} value={formatCurrency(line.amount)} dim />
              ))}
              <div style={{ height: 1, background: "var(--color-line-strong)", margin: "12px 0" }} />
              <Row label="Total" value={formatCurrency(bill.total)} big />
            </div>

            {/* Partial payments */}
            {bill.payments.length > 0 && (
              <div style={{ marginTop: 18, padding: 12, background: "var(--color-blue-soft)", borderRadius: 10, fontSize: 13 }}>
                <div style={{ fontSize: 11, color: "var(--color-blue)", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 6 }}>Payments received</div>
                {bill.payments.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", color: "var(--color-ink-2)", padding: "3px 0" }}>
                    <span style={{ textTransform: "capitalize" }}>{p.mode}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(0,0,0,.06)" }}>
                  <span>Remaining</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: remaining > 0 ? "var(--color-red)" : "var(--color-green)" }}>{formatCurrency(remaining)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: payment collection */}
        <div style={{ background: "var(--color-surface)", borderLeft: "1px solid var(--color-line)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 12, color: "var(--color-ink-3)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 500 }}>Collect payment</div>

          {/* Amount due card */}
          <div style={{
            padding: 24, background: "var(--color-ink)", color: "var(--color-bg)",
            borderRadius: 16, textAlign: "center",
          }}>
            <div style={{ fontSize: 12, opacity: .7, letterSpacing: ".04em", textTransform: "uppercase" }}>Amount due</div>
            <div style={{ fontSize: 44, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 4, letterSpacing: "-.02em" }}>
              {formatCurrency(remaining)}
            </div>
          </div>

          {/* Mode selector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {PAYMENT_MODES.map(({ id, label, icon }) => (
              <button key={id} onClick={() => setMode(id)} style={{
                padding: "14px 8px", borderRadius: 12,
                border: "1.5px solid " + (mode === id ? "var(--color-ink)" : "var(--color-line)"),
                background: mode === id ? "var(--color-ink)" : "var(--color-surface)",
                color: mode === id ? "var(--color-bg)" : "var(--color-ink)",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
                textTransform: "capitalize", transition: "all .1s",
                fontFamily: "inherit",
              }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div>
            <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginBottom: 6 }}>
              {mode === "cash" ? "Cash tendered (optional)" : "Custom amount (for split)"}
            </div>
            <input
              value={tendered}
              onChange={(e) => setTendered(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={"₹" + Math.ceil(remaining)}
              style={{
                width: "100%", height: 56, padding: "0 18px",
                border: "1px solid var(--color-line-strong)", borderRadius: 12,
                background: "var(--color-bg)", color: "var(--color-ink)",
                fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500,
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-ink-3)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--color-line-strong)")}
            />
            {change > 0.005 && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--color-green)", display: "flex", justifyContent: "space-between" }}>
                <span>Change due</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatCurrency(change)}</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleCollect}
            disabled={remaining <= 0 || payMutation.isPending}
            style={{
              height: 56, borderRadius: 14,
              background: "var(--color-green)",
              border: "1px solid oklch(58% 0.13 150)",
              color: "white",
              fontSize: 16, fontWeight: 600, fontFamily: "inherit",
              cursor: remaining > 0 ? "pointer" : "not-allowed",
              opacity: remaining > 0 ? 1 : .4,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            {payMutation.isPending ? "Processing…" : `Collect ${formatCurrency(Math.min(collectAmt, remaining))}`}
            {!payMutation.isPending && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
