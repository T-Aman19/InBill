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
