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
// In Tauri's WKWebView, window.print() is swallowed without reaching the OS
// print dialog. Use Tauri's invoke API when available, fall back to the
// browser API everywhere else (LAN browsers, dev server).
export function triggerPrint() {
    const tauri = window.__TAURI_INTERNALS__;
    if (tauri) {
        tauri.invoke('print_window').catch(() => window.print());
    }
    else {
        window.print();
    }
}
