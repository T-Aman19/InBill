# Self-Hosted (OSS) → Managed Cloud Migration Plan

> **Status:** Parked / not started. Design notes for a `migrate-to-cloud` capability.
> Revisit later. Grounded in the current codebase (Aug 2026).

## Problem

A customer runs the open-source build on their own server
(`DEPLOYMENT_MODE=local`) and wants to move to the managed cloud. Today there is
**no migration path** — signing up for cloud gives them a fresh, empty tenant and
their historical data (bills, menu, customers, inventory, staff) stays trapped in
their local Postgres.

## Why this is tractable (architecture already favours it)

- **Same storage engine both sides.** `apps/server/src/db/index.ts` uses the
  `postgres` (postgres-js) driver for both local and cloud — only pool size
  differs. Self-hosted runs its own Postgres; cloud runs managed Postgres. Same
  dump format, no engine conversion.
- **Same schema + migrator.** Identical Drizzle schema and `embedded-migrate.ts`.
- **UUID primary keys everywhere** (`defaultRandom()`) → rows insert into the
  shared cloud DB with near-zero collision risk; no ID remapping.
- **Clean tenant tree.** Everything hangs off `owners → outlets → …`. One
  customer = one owner subtree that can be lifted wholesale.

> Note: `config.cloud` (`CLOUD_API_URL`, `syncIntervalMs`) is **dead scaffolding** —
> nothing consumes it. Any real sync/migration is greenfield.

## Approach: scoped subtree export/import

Not a whole-DB `pg_dump`/`pg_restore` (the cloud DB is multi-tenant). Instead,
extract **one owner's UUID-keyed subtree** and insert it into the shared cloud DB.

```
owners(row)
 └─ outlets(rows for this owner)
     └─ every descendant scoped by outletId:
        menu (categories, items, variants, modifiers), tax configs, charges,
        discounts, tables, orders, order_items, kots, bills, bill_payments,
        bill_discounts, bill_charges, customers, customer_points,
        point_transactions, loyalty_programs, inventory (ingredients, recipes,
        stock_movements, vendors, purchase_orders), users (staff), shifts,
        audit_log, reservations/queue …
```

Export walks the FK graph from the owner root; import inserts in dependency order
(parents before children) inside a single transaction.

## The hard parts (this is where the real work is — not the data copy)

### 1. Schema-version alignment (step zero)
Both sides must be on the **same migration version** before copying, or columns
mismatch. Migrations here are hand-managed (`embedded-migrate.ts` is the real
migrator; drizzle journal has drifted). Export must record the local schema
version and refuse/upgrade if it doesn't match cloud.

### 2. Owner identity reconciliation
The local install has its own `owners` row; on cloud the customer will have (or
create) an owner account for billing. Decide the mapping:
- **Option A — adopt local ownerId:** insert the local owner row into cloud as-is,
  then attach the cloud login/subscription to that ownerId. Simplest; preserves
  all FKs untouched.
- **Option B — remap to a pre-created cloud owner:** rewrite `ownerId` on the
  outlet subtree to the cloud account's id. Needed if they already signed up.
- Recommended: support B (remap), since most will have created a cloud account to
  pay. Build an ownerId-rewrite pass over the exported subtree.

### 3. Unique-field collisions
- `owners.email` — UNIQUE. If the cloud account shares the email → merge, don't
  blind-insert.
- `outlets.setupCode` — UNIQUE globally. Re-issue if it collides.
- Staff `users` may have per-outlet unique constraints — verify on import.

### 4. Cutover freeze (no dual-write exists)
Sequence: freeze local writes → export → import → verify row counts → repoint
clients to the cloud URL. Bills rung up after export but before cutover would be
lost, so the window must be explicit (ideally after close-of-day).

### 5. File assets
`menu.imageUrl` is a plain **text URL**, not a blob. If it points at the
customer's local host it will 404 on cloud — images must be re-hosted (upload to
cloud object storage + rewrite the URLs) as part of import. Confirm no other
filesystem-backed assets exist.

### 6. ⚠️ Entitlements flip from unlimited → gated
Self-hosted resolves **every** feature to `allowed` (local short-circuit in
`lib/entitlements.ts`). On cloud, gating activates. A customer who freely ran
multi-outlet + kitchen stations + aggregator sync self-hosted will find the
**data migrates intact but access locks** unless their plan includes those
features (multi-outlet & kitchen stations are Growth+).

Mitigations to design:
- Detect which gated features the imported data actually uses (e.g. >1 outlet,
  any kitchen stations, aggregator config) and **recommend the matching plan**
  during migration.
- Consider a **grace period** (temporary entitlement grant) so a freshly migrated
  account isn't a wall of "Pro" locks over data they already own.
- Surface a clear "your self-hosted setup uses X, Y — these need the ___ plan"
  summary before cutover.

## Rough shape of the deliverable

- `apps/server/src/scripts/export-tenant.ts` — run on the **local** server; emits
  a single portable bundle (JSON or SQL) of the owner subtree + a manifest
  (schema version, row counts, feature-usage summary, image URL list).
- `apps/server/src/scripts/import-tenant.ts` — run against **cloud**; validates
  schema version, performs ownerId reconciliation + collision handling, re-hosts
  images, inserts in FK order in a transaction, verifies row counts.
- Preflight report: schema match, collisions, feature/plan implications.
- Idempotency / dry-run mode; rollback on failure (single transaction).

## Open questions (resolve before building)

1. Self-serve or white-glove? (CLI we run for them, vs. a button in the app.)
2. One owner per migration only, or multi-owner installs?
3. Grace period policy for gated features — how long, which features?
4. Image/object-storage target on cloud (S3-compatible bucket?).
5. Verification bar for a "successful" migration (row-count parity + spot checks?).

## Related

- Entitlements gating: `packages/shared/src/schemas/entitlements.ts`,
  `apps/server/src/lib/entitlements.ts` (local = unlimited).
- Subscription checkout (separate, also unbuilt) — a migrated owner needs a plan;
  see subscription-checkout planning.
