export function formatCurrency(amount: number | string): string {
  const n = Math.round(Number(amount) * 100) / 100
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
