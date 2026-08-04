# Subscription Checkout (Razorpay)

> **Status:** Backend foundation built (Aug 2026). Website checkout page + app
> wiring + GST/dunning still to do. Managed-cloud only — local/self-hosted is
> unlimited and never billed.

## Decisions locked
- **Razorpay Subscriptions** (recurring auto-debit via UPI Autopay / card mandate).
- **Monthly + discounted annual** (annual ≈ 2 months free).
- **Checkout lives on the website**, not the POS. The POS just links out + shows
  plan status.
- Enterprise is **sales-led** (manual `subscriptions` row), not self-serve.

## What's built (server)
| Piece | Location |
|---|---|
| Schema: `subscriptions` (+`cycle`,`cancel_at_period_end`,`razorpay_customer_id`), `billing_webhook_events` | `db/schema/entitlements.ts`, migration `0024_subscription_billing.sql` |
| Razorpay REST client (Basic-auth fetch, HMAC webhook verify) — no SDK dep | `lib/razorpay.ts` |
| Shared types: `subscribeSchema`, `BillingCycle`, `PURCHASABLE_PLANS`, `PLAN_PRICING`, `planCycleKey` | `packages/shared/src/schemas/entitlements.ts` |
| Routes under `/api/billing` | `routes/subscriptions.ts` |

### Endpoints
- `POST /api/billing/webhook` — **public**, HMAC-verified, idempotent (dedupes on
  `x-razorpay-event-id`). Maps `subscription.*` events → `subscriptions.status`.
  This is the only writer that flips a plan live.
- `POST /api/billing/subscribe` *(owner auth)* — creates/reuses Razorpay customer
  + subscription, returns `{ subscriptionId, shortUrl, razorpayKeyId }`. Row is
  written with `status="past_due"` (= awaiting first charge) so gating does **not**
  unlock until the webhook confirms payment.
- `GET  /api/billing/subscription` *(owner auth)* — current plan/status/renews-on
  for the billing page + POS badge.
- `POST /api/billing/cancel` *(owner auth)* — cancel at cycle end.

### Status mapping (Razorpay → ours)
`active`/`authenticated` → **active** · `pending`/`halted`/`paused` → **past_due**
· `cancelled`/`completed`/`expired` → **canceled** · `created`/unknown → **past_due**.
`loadContext()` already downgrades `past_due`/`canceled` to free, so the webhook
never touches entitlement logic.

## Setup needed to run with test keys
1. **Razorpay Dashboard → Plans:** create one Plan per tier × cycle (4 total) with
   the amounts in `PLAN_PRICING` (paise). Note each `plan_id`.
2. **Razorpay Dashboard → Webhooks:** add `https://<host>/api/billing/webhook`,
   subscribe to `subscription.*` events, set a secret.
3. **Env vars** (cloud host):
   ```
   DEPLOYMENT_MODE=cloud          # gating + billing only active in cloud
   RAZORPAY_KEY_ID=...            # test keys you have
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...    # from step 2
   RAZORPAY_PLAN_STARTER_MONTHLY=plan_...
   RAZORPAY_PLAN_STARTER_ANNUAL=plan_...
   RAZORPAY_PLAN_GROWTH_MONTHLY=plan_...
   RAZORPAY_PLAN_GROWTH_ANNUAL=plan_...
   ```
4. Local webhook testing: tunnel (ngrok) → point the dashboard webhook at it.

## Remaining work
- **Website billing page** — plan/cycle picker → `POST /subscribe` → redirect to
  `shortUrl`. Needs owner auth (see handoff note below).
- **App wiring** — repoint the two dead CTAs (`Entitlement.tsx` → `/manager/billing`
  & `/manager/settings#api-keys`) to the website; show plan badge via
  `GET /billing/subscription`.
- **`change-plan`** — upgrade/downgrade with proration (Razorpay subscription update).
- **GST invoicing** — 18% GST + GSTIN capture (no owner-level GSTIN field yet).
- **Dunning** — retry emails on `past_due` before hard downgrade (Resend is wired).

## Open decisions (deferred)
1. **Website ↔ backend auth handoff.** `/subscribe` currently takes an owner Bearer
   token (works if the site shares the InBill session). If the site is a separate
   property, add a signed short-lived token handoff (mint at owner-login, verify in
   `/subscribe`). Was "not sure yet" — build the token path when the site arch is set.
2. **Annual UPI Autopay > ₹15k AFA.** Growth annual (₹17,990) may trip per-charge
   additional-factor auth on UPI Autopay — prefer card/eNACH mandate for annual.
   Verify current RBI e-mandate threshold for our MCC.
3. Plan-level free trial? (Have Free tier + per-feature trials already — leaning no.)
4. Proration policy: upgrade immediate / downgrade at period end.
5. GST invoice source: Razorpay Invoices vs. own PDF.

## Related
- Gating engine (the reader): `lib/entitlements.ts`, `schemas/entitlements.ts`.
- OSS→cloud migration (a migrated owner needs a plan): `MIGRATION_TO_CLOUD.md`.
