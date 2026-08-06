# Zomato POS Integration — Readiness Plan

> **Status:** Parked / not started. Feature-parity prep for a future aggregator
> integration. Revisit later — likely alongside the "Aggregators (UrbanPiper)"
> track in [SPRINTS.md](SPRINTS.md) Sprint 4.
> Grounded in a codebase audit against Zomato's public integration docs
> ([Critical Feature List](https://www.zomato.com/developer/integration/docs/getting-started/critical-feature-list/),
> [Prerequisites](https://www.zomato.com/developer/integration/docs/getting-started/prerequisites))
> conducted 2026-08-06.

## Why this exists

Zomato requires **100% parity** on its critical feature list before a POS
vendor can integrate — it's an all-or-nothing gate, not pick-and-choose. This
doc closes InBill's internal feature/schema gaps *before* any actual Zomato
API work (auth, webhooks, catalog push) is attempted. Phase D below is a
placeholder for that real integration work once Phases A–C are done and the
business prerequisites in Phase E are met.

**Legend:** `[ ]` not started · `[x]` done · `[-]` in progress

---

## Business prerequisites (non-code — track here for visibility)

These gate eligibility regardless of engineering readiness. Not actionable by
writing code; listed so the plan doesn't look complete when it isn't.

- [ ] 50 restaurants onboarded on InBill, **or** 10,000 orders/month platform-wide (Zomato's stated minimum — final call is theirs)
- [ ] Dedicated 24×7 on-call channel (Slack/WhatsApp) with tech + product + ops PICs, <10 min turnaround SLA
- [ ] Uptime/observability sufficient to credibly claim 99.999% — currently just a bare `GET /health` liveness check (`apps/server/src/index.ts:85`), no error tracking (Sentry/etc.), no status page, no alerting

---

## Phase A — Menu model gaps

**Goal:** close schema/field gaps identified in the audit. Mostly additive columns + a few new endpoints. No architectural risk.

**Effort:** ~3-4 days

### A1. Category hierarchy (subcategories)

> Currently `categories` is flat — no subcategory concept anywhere.

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Add `parentId UUID NULL REFERENCES categories(id)` to `categories`. Migration. | `apps/server/src/db/schema/menu.ts`, `apps/server/src/db/migrations/` | 30 min |
| 2 | Update `categoriesRelations` for self-referencing parent/children | `apps/server/src/db/schema/relations.ts` | 30 min |
| 3 | Add `parentId` to `createCategorySchema` / `updateCategorySchema` | `packages/shared/src/schemas/menu.ts` | 30 min |
| 4 | `GET /categories` returns nested tree (or flat + parentId, client builds tree) | `apps/server/src/routes/menu.ts` | 1 hr |
| 5 | ManagerPage: indent subcategories under parent in sidebar, "+ Add subcategory" action | `apps/pos/src/pages/ManagerPage.tsx` | 3 hrs |

### A2. Item + category metadata fields

| # | Task | Files | Effort |
|---|------|-------|--------|
| 6 | Add columns to `menuItems`: `meatType` (enum: `chicken\|mutton\|fish\|egg\|none`), `beverageBrandTag` (text, nullable), `servingInfo` (text, e.g. "Serves 2"), `nutritionalInfo` (jsonb: calories/protein/etc.), `isService` (boolean, for GST 9(5) goods-vs-service split alongside existing `hsnCode`; add `sacCode` for services) | `apps/server/src/db/schema/menu.ts`, migration | 1 hr |
| 7 | Add `tags` (text[] or jsonb) to `categories` for Zomato-style category classification tags | `apps/server/src/db/schema/menu.ts`, migration | 30 min |
| 8 | Add `isVeg` boolean to `modifiers` table (add-on level dietary tag) | `apps/server/src/db/schema/menu.ts`, migration | 30 min |
| 9 | Wire all new fields through create/update schemas | `packages/shared/src/schemas/menu.ts` | 1 hr |
| 10 | ItemEditPanel: meat type select, beverage tag input, serving info input, nutrition fields, goods/service toggle + SAC code | `apps/pos/src/pages/ManagerPage.tsx` | 4 hrs |

### A3. Reversible OOS toggles (currently one-way soft-delete)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 11 | `updateCategorySchema` expose `isActive`; category behaves like item availability toggle, not delete | `packages/shared/src/schemas/menu.ts`, `apps/server/src/routes/menu.ts` | 1 hr |
| 12 | `updateVariantSchema` expose `isActive`; `PATCH /items/:itemId/variants/:id` can flip it without going through DELETE | `packages/shared/src/schemas/menu.ts`, `apps/server/src/routes/menu.ts` | 1 hr |
| 13 | UI: category and variant rows get the same 86'ing toggle pattern items already have | `apps/pos/src/pages/ManagerPage.tsx` | 2 hrs |

### A4. Item-level charges

| # | Task | Files | Effort |
|---|------|-------|--------|
| 14 | Add `chargeType` enum (`packaging\|delivery\|other`) to `charges`; add nullable `itemId` FK so a charge can be scoped to an item instead of always bill-level | `apps/server/src/db/schema/billing.ts`, migration | 1 hr |
| 15 | Billing calc: sum item-scoped charges alongside bill-level ones | `apps/server/src/routes/bills.ts` (or wherever bill totals compute) | 2 hrs |

---

## Phase B — Inbound order acceptance model

**Goal:** the architectural gap. InBill currently assumes every order is staff-created. Aggregator orders arrive externally and must be accepted/rejected within an SLA — that state machine doesn't exist yet.

**Effort:** ~5-7 days — do this phase last, it's the one that actually needs design review, not just schema additions.

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Add `source` enum to `orders` (`dine_in\|takeaway\|aggregator`) if not already covering this; add `acceptanceStatus` (`pending\|accepted\|rejected`), `rejectionReasonCode`, `rejectionItemId` (nullable, for IOOS-flagged rejections), `kptMinutes`, `acceptedAt`, `rejectedAt` | `apps/server/src/db/schema/orders.ts`, migration | 2 hrs |
| 2 | Define rejection reason code enum (item OOS, kitchen too busy, kitchen closed, etc. — mirror Zomato's own reason list once partner docs are available) | `packages/shared/src/schemas/order.ts` | 1 hr |
| 3 | `POST /orders/:id/accept` — sets `acceptanceStatus=accepted`, `acceptedAt`, optional `kptMinutes` | `apps/server/src/routes/orders.ts` | 2 hrs |
| 4 | `POST /orders/:id/reject` — sets `acceptanceStatus=rejected`, `rejectionReasonCode`, optional `rejectionItemId`; broadcasts WS event | `apps/server/src/routes/orders.ts` | 2 hrs |
| 5 | Merchant-agreed cancellation: cancellation *request* state requiring explicit merchant confirm/reject within a window, separate from today's immediate/automatic cancel | `apps/server/src/routes/orders.ts`, `apps/server/src/db/schema/orders.ts` | 4 hrs |
| 6 | KDS/FloorPage: accept/reject UI for pending aggregator orders, reason picker on reject | `apps/pos/src/pages/KdsPage.tsx`, `FloorPage.tsx` | 4 hrs |
| 7 | Structured `noCutlery` boolean alongside existing free-text `notes` on order items | `apps/server/src/db/schema/orders.ts`, `packages/shared/src/schemas/order.ts`, migration | 1 hr |

### B-extra: audio order alert (cheap, decoupled, do anytime)

> Not aggregator-specific — benefits dine-in too. No dependency on the rest of Phase B.

| # | Task | Files | Effort |
|---|------|-------|--------|
| 8 | Play a sound on `order.created` WS event in KDS/Floor (currently visual-only: WS push + overdue toast, no audio anywhere in `apps/pos/src`) | `apps/pos/src/pages/KdsPage.tsx`, `FloorPage.tsx` | 1 hr |

---

## Phase C — Outlet management

**Effort:** ~1-2 days

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Add outlet-wide operating hours (`openTime`/`closeTime` or weekly jsonb) to `outlets` — distinct from the existing per-category `menuSchedules` | `apps/server/src/db/schema/owners.ts`, migration | 1 hr |
| 2 | `PATCH /outlet` accepts hours; render "Store Hours" section in Outlet Settings | `apps/server/src/routes/outlet.ts`, `apps/pos/src/pages/owner/OutletSettingsDrawer.tsx` | 2 hrs |
| 3 | Live "stop accepting orders" toggle — new `isAcceptingOrders` boolean, distinct from `outlets.isActive` (which is a deprovision/soft-delete flag today, not an operational switch) | `apps/server/src/db/schema/owners.ts`, migration | 1 hr |
| 4 | `PATCH /outlet/status { isAcceptingOrders, reason }` + audit row (`outletStatusLog`: outletId, isOpen, reason, changedBy, changedAt) | `apps/server/src/routes/outlet.ts`, new table in `apps/server/src/db/schema/owners.ts` | 3 hrs |
| 5 | `POST /orders` rejects new orders when outlet is toggled off | `apps/server/src/routes/orders.ts` | 30 min |
| 6 | UI toggle (Manager/Owner header) + reason picker modal on turning off | `apps/pos/src/pages/ManagerPage.tsx` or header component | 2 hrs |

---

## Phase D — Actual Zomato API integration (future, not scoped yet)

Deferred until Phases A–C are done and Phase E prerequisites are realistically in reach. Needs Zomato partner API docs beyond what's been reviewed so far (menu-push format, webhook payloads, auth flow) — the endpoints/webhooks reference pages exist at `/developer/integration/api-reference/v1/endpoints` and `/v1/webhooks` but haven't been read yet. When this phase starts:

- [ ] Partner auth / API key exchange
- [ ] Catalog push: map InBill menu model → Zomato menu format (this is why Phase A closes the field gaps first)
- [ ] Webhook receiver for inbound orders → creates `orders` rows with `source=aggregator`, `acceptanceStatus=pending`
- [ ] Call Zomato's accept/reject/status APIs from InBill's own accept/reject actions (Phase B)
- [ ] Outlet on/off + offline-reason sync to Zomato (Phase C)
- [ ] Menu availability sync (item/category OOS toggles → Zomato in near-real-time)

---

## Build order

| Phase | Duration | Depends on |
|---|---|---|
| A — Menu model gaps | 3-4 days | none |
| B — Order acceptance model | 5-7 days | A (item/category OOS toggles feed rejection reasons) |
| C — Outlet management | 1-2 days | none, can run parallel with A |
| E — Business prerequisites | ongoing, GTM-owned | none |
| D — Real Zomato integration | unscoped | A, B, C, E all substantially done |

**~10-13 engineering days for A–C.** D is unscoped until partner docs are read and API access is available.
