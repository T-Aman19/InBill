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

function authHeader(): string {
  const token = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64")
  return `Basic ${token}`
}

async function rzp<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw new RazorpayError("Razorpay is not configured on this server", 500, null)
  }
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
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

/** Constant-time verify of the `x-razorpay-signature` header against the raw body. */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !config.razorpay.webhookSecret) return false
  const expected = createHmac("sha256", config.razorpay.webhookSecret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
