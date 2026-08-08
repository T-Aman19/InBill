// Thin Razorpay REST client — we only touch Customers and Subscriptions, so a
// full SDK dependency isn't worth it. Auth is HTTP Basic (keyId:keySecret);
// webhook verification is HMAC-SHA256 over the raw request body.
import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "../config.js"

const BASE = "https://api.razorpay.com/v1"

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = "RazorpayError"
  }
}

// Per-outlet BYOK calls (bill payments) pass their own keyId/keySecret; calls
// with none fall back to InBill's own platform keys (subscription billing).
async function rzp<T>(path: string, init?: { method?: string; body?: unknown; keyId?: string; keySecret?: string }): Promise<T> {
  const keyId = init?.keyId ?? config.razorpay.keyId
  const keySecret = init?.keySecret ?? config.razorpay.keySecret
  if (!keyId || !keySecret) {
    throw new RazorpayError("Razorpay is not configured", 500, null)
  }
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg = (data as any)?.error?.description ?? `Razorpay request failed (${res.status})`
    throw new RazorpayError(msg, res.status, data)
  }
  return data as T
}

// ── response shapes (only the fields we consume) ─────────────────────────────

export type RzpCustomer = { id: string; email: string | null; contact: string | null }

export type RzpSubscription = {
  id: string
  status: string // created | authenticated | active | pending | halted | cancelled | completed | paused
  plan_id: string
  customer_id: string | null
  current_start: number | null // unix seconds
  current_end: number | null // unix seconds
  short_url: string | null // hosted mandate-authorization page
  notes?: Record<string, string>
}

// ── operations ───────────────────────────────────────────────────────────────

// Razorpay rejects names that are too short or contain disallowed characters
// ("The name format is invalid."). Reduce to a safe subset with a sane length,
// falling back to the email local-part, then a constant.
export function razorpaySafeName(raw: string, email: string): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} .,'&()\/\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 50)
  let name = clean(raw || "")
  if (name.length < 3) name = clean(email.split("@")[0] ?? "")
  return name.length >= 3 ? name : "InBill Customer"
}

/** Create (or reuse, via fail_existing:0) a Razorpay customer for an owner. */
export function createCustomer(input: { name: string; email: string; contact?: string }): Promise<RzpCustomer> {
  return rzp<RzpCustomer>("/customers", {
    method: "POST",
    body: { name: razorpaySafeName(input.name, input.email), email: input.email, contact: input.contact, fail_existing: 0 },
  })
}

export function createSubscription(input: {
  planId: string
  customerId: string
  totalCount: number
  notes?: Record<string, string>
}): Promise<RzpSubscription> {
  return rzp<RzpSubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.planId,
      customer_id: input.customerId,
      total_count: input.totalCount,
      customer_notify: 1,
      notes: input.notes,
    },
  })
}

export function fetchSubscription(id: string): Promise<RzpSubscription> {
  return rzp<RzpSubscription>(`/subscriptions/${id}`)
}

export type RzpPlan = {
  id: string
  period: string // daily | weekly | monthly | yearly
  interval: number
  item: { name: string; amount: number; currency: string; description: string | null }
  notes?: Record<string, string>
}

/** Fetch a Razorpay Plan (name, amount, notes) — used to render the pricing catalog. */
export function fetchPlan(id: string): Promise<RzpPlan> {
  return rzp<RzpPlan>(`/plans/${id}`)
}

export function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzpSubscription> {
  return rzp<RzpSubscription>(`/subscriptions/${id}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 },
  })
}

// ── Payment Links (outlet BYOK — bill payment collection) ────────────────────
// Each outlet authenticates with its own Razorpay keys, never InBill's platform
// keys. Deliberately NOT using the QR Codes product: live-tested against a real
// test-mode account and it 400s ("requested URL not found") — that product
// needs a separate account-level activation Razorpay doesn't grant by default,
// which most small outlets won't have. Payment Links works out of the box on
// every account (verified live: create/fetch/cancel all 200 on a stock test key).
// There's no webhook here: registering one programmatically requires Razorpay's
// Partner/OAuth program, out of reach for a plain merchant key pair. Instead the
// billing screen's existing 3s poll loop checks status live (see fetchPaymentLink).
//
// `upi_link: true` (a more UPI-native, one-tap experience) is a documented
// option but Razorpay itself rejects it outright in Test Mode ("not supported
// in Test Mode, experience in Live Mode") — enabling it unconditionally would
// break every test-mode account. Left off for now; worth an opt-in once an
// outlet is confirmed live-mode, but that path is unverified from here.

export type RzpPaymentLink = {
  id: string
  status: "created" | "launched" | "attempted" | "paid" | "partially_paid" | "expired" | "cancelled"
  short_url: string
  amount: number
  amount_paid: number
}

type OutletCreds = { keyId: string; keySecret: string }

// Razorpay rejects anything under 15 minutes ("timestamp must be atleast 15
// minutes in future") — verified live; the QR Codes product allowed 10. Exactly
// 15 still 400s (request latency eats into the window before Razorpay checks
// it), so pad to 16 for a safety margin.
export const PAYMENT_LINK_EXPIRY_MS = 16 * 60 * 1000

/** Create a fixed-amount payment link for one bill payment. Expires in 15 min.
 * `callbackUrl` (guest self-checkout only) brings the customer back to the QR
 * menu page after paying — not used for staff-initiated payments, where the
 * QR is scanned by the customer's own separate device. */
export function createPaymentLink(
  creds: OutletCreds,
  input: { amountPaise: number; referenceId: string; description: string; callbackUrl?: string },
): Promise<RzpPaymentLink> {
  return rzp<RzpPaymentLink>("/payment_links", {
    method: "POST",
    keyId: creds.keyId,
    keySecret: creds.keySecret,
    body: {
      amount: input.amountPaise,
      currency: "INR",
      description: input.description.slice(0, 255),
      reference_id: input.referenceId,
      accept_partial: false,
      expire_by: Math.floor((Date.now() + PAYMENT_LINK_EXPIRY_MS) / 1000),
      ...(input.callbackUrl ? { callback_url: input.callbackUrl, callback_method: "get" } : {}),
    },
  })
}

export function fetchPaymentLink(creds: OutletCreds, id: string): Promise<RzpPaymentLink> {
  return rzp<RzpPaymentLink>(`/payment_links/${id}`, { keyId: creds.keyId, keySecret: creds.keySecret })
}

/** Best-effort cancel — called when staff cancels the modal so a stale link can't be paid later. */
export function cancelPaymentLink(creds: OutletCreds, id: string): Promise<RzpPaymentLink> {
  return rzp<RzpPaymentLink>(`/payment_links/${id}/cancel`, { method: "POST", keyId: creds.keyId, keySecret: creds.keySecret })
}

/** Constant-time verify of the `x-razorpay-signature` header against the raw body. */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !config.razorpay.webhookSecret) return false
  const expected = createHmac("sha256", config.razorpay.webhookSecret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
