import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string): string {
  const n = Math.round(Number(amount) * 100) / 100
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatCurrencyInt(amount: number | string): string {
  return '₹' + Math.round(Number(amount)).toLocaleString('en-IN')
}

// Compact form for chart axis labels — ₹1.2L, ₹850, never fractional at small values.
export function formatCurrencyCompact(amount: number | string): string {
  const n = Number(amount)
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '₹' + Math.round(n)
}

// In Tauri's WKWebView, window.print() is swallowed without reaching the OS
// print dialog. Use Tauri's invoke API when available, fall back to the
// browser API everywhere else (LAN browsers, dev server).
export function triggerPrint(): void {
  const tauri = (window as Window & { __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<void> } }).__TAURI_INTERNALS__
  if (tauri) {
    tauri.invoke('print_window').catch(() => window.print())
  } else {
    window.print()
  }
}
