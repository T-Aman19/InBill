// Thin loader/wrapper around Razorpay's hosted Checkout.js — used only for
// InBill's own subscription checkout (Owner Dashboard). The per-outlet
// customer-payment flow (billing.ts /payments/upi) is unrelated and doesn't
// use this.
const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js"

type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

type RazorpayCheckoutOptions = {
  key: string
  subscription_id: string
  name: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  notes?: Record<string, string>
  theme?: { color?: string }
  handler: (response: RazorpaySuccessResponse) => void
  modal?: { ondismiss?: () => void }
}

type RazorpayInstance = { open: () => void }
type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let loadPromise: Promise<void> | null = null

/** Injects Checkout.js once (memoized) and resolves when `window.Razorpay` is ready. */
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error("Razorpay checkout script loaded but window.Razorpay is missing")))
    script.onerror = () => reject(new Error("Couldn't load the payment form — check your connection and try again"))
    document.head.appendChild(script)
  }).catch((err) => {
    loadPromise = null // allow retrying on next call instead of caching the failure forever
    throw err
  })

  return loadPromise
}

export type CheckoutResult = { status: "paid" } | { status: "dismissed" }

/** Opens the Checkout.js modal and resolves once it's paid or dismissed — never rejects on a plain close. */
export function openRazorpayCheckout(options: Omit<RazorpayCheckoutOptions, "handler" | "modal">): Promise<CheckoutResult> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error("Razorpay checkout isn't loaded yet"))
      return
    }
    const rzp = new window.Razorpay({
      ...options,
      handler: () => resolve({ status: "paid" }),
      modal: { ondismiss: () => resolve({ status: "dismissed" }) },
    })
    rzp.open()
  })
}
