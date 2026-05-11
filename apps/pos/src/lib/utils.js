import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
export function formatCurrency(amount) {
    const n = Math.round(Number(amount) * 100) / 100;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatCurrencyInt(amount) {
    return '₹' + Math.round(Number(amount)).toLocaleString('en-IN');
}
