# InBill — Implementation Plan

Based on the Claude Design handoff bundle (Owner + Inventory screens).

**Legend:** `[ ]` not started · `[x]` done · `[-]` in progress

---

## Track 0 — Design System Integration

> Prerequisite for all visual work. Unblocks pixel-perfect implementation of every screen.

- [ ] Copy `styles.css` from handoff bundle into `apps/pos/src/assets/design-system.css` and import in `main.tsx`
- [ ] Register Inter Tight + JetBrains Mono fonts in `apps/pos/index.html`
- [ ] Verify CSS vars (`--bg`, `--surface`, `--surface-2`, `--line`, `--ink` through `--ink-4`) resolve correctly in the app
- [ ] Verify `.btn`, `.badge`, `.dot`, `.veg-dot` utility classes are available globally

---

## Track 1 — Owner Screen Visual Polish

> Existing owner pages work functionally but don't match the designs. Quick visual alignment.

### OwnerDashboard (`apps/pos/src/pages/OwnerDashboardPage.tsx`)
- [ ] Add pill stat strip at top: 3 pills — Total Outlets · Today's Revenue · Active Orders
- [ ] Switch to 2-column outlet card grid
- [ ] Each card: outlet name + address, revenue badge (green), bill count, open orders, UPI configured dot
- [ ] Apply warm `--bg` (#1a1715) background, `shadow-1` on cards, `--surface` card fill

### OwnerLogin (`apps/pos/src/pages/OwnerLoginPage.tsx`)
- [ ] Apply Inter Tight headings
- [ ] Style tab toggle as pill selector (Login / Register)
- [ ] Apply warm background, consistent with design tokens

### UPIModal (inside `apps/pos/src/pages/BillingPage.tsx`)
- [ ] QR area: white square centered in modal
- [ ] Add pulsing amber ring animation on the QR border (CSS keyframe)
- [ ] "Waiting for payment…" with bouncing dot indicator (CSS animation)
- [ ] Amount displayed in JetBrains Mono
- [ ] Two buttons: Cancel (ghost) + Simulate ✓ (green solid)

---

## Track B1 — Ingredients, Recipes & Stock Movements

> Sprint 3 (~5 days). Foundation of the entire inventory system.

### B1-A: Database Schema

- [ ] Create `apps/server/src/db/schema/inventory.ts` with 4 tables:
  - `ingredients` — `id, outletId, name, unit (kg|g|L|mL|pcs), currentStock, reorderLevel, costPerUnit, isActive`
  - `recipes` — `id, menuItemId (unique FK → menuItems.id), note`
  - `recipeIngredients` — `id, recipeId, ingredientId, quantity`
  - `stockMovements` — `id, outletId, ingredientId, type (purchase|sale|waste|adjustment), delta, referenceId, referenceType, note, recordedById, createdAt`
- [ ] Export from `apps/server/src/db/schema/index.ts`
- [ ] Add Zod schemas to `packages/shared/src/schemas/inventory.ts`:
  - `createIngredientSchema`, `updateIngredientSchema`
  - `createRecipeSchema`, `updateRecipeSchema`
  - `createMovementSchema` (manual adjustments)
- [ ] Run `bun drizzle-kit generate` and apply migration

### B1-B: Backend Routes (`apps/server/src/routes/inventory.ts`)

- [ ] `GET /api/inventory/ingredients` — list for outlet, include `isBelowReorder` derived field
- [ ] `POST /api/inventory/ingredients` — create (manager/owner)
- [ ] `PATCH /api/inventory/ingredients/:id` — update fields
- [ ] `DELETE /api/inventory/ingredients/:id` — soft delete (set `isActive = false`); reject if used in any recipe
- [ ] `GET /api/inventory/recipes` — list with `menuItem` name joined
- [ ] `POST /api/inventory/recipes` — create with nested `recipeIngredients`
- [ ] `PATCH /api/inventory/recipes/:id` — replace ingredient lines (delete + re-insert)
- [ ] `GET /api/inventory/movements` — filterable by `?type=&ingredientId=&from=&to=`; returns aggregated stats (totalIn, totalOut, waste, net) alongside rows
- [ ] `POST /api/inventory/movements` — manual adjustment (waste / correction); inserts movement + adjusts `currentStock`
- [ ] `GET /api/inventory/valuation` — sum of `currentStock × costPerUnit` per ingredient
- [ ] Mount inventory router in `apps/server/src/index.ts`

### B1-C: Post-Billing Auto-Deduct Hook

- [ ] In `POST /api/bills` (billing.ts): after bill is created, query all `orderItems` for the bill
- [ ] For each item: look up its `recipe` → `recipeIngredients`; deduct `quantity × orderedQty` from `ingredients.currentStock`
- [ ] Insert a `stockMovements` row of type `sale` per ingredient deducted, `referenceId = billId`, `referenceType = "bill"`
- [ ] After deduction: check if any ingredient crossed its `reorderLevel`; if so, broadcast `inventory.low_stock` WS event with ingredient list

### B1-D: Frontend — InventoryPage Chrome

- [ ] Create `apps/pos/src/pages/InventoryPage.tsx` — top-level page with sidebar tabs
- [ ] InvSidebar: 220px fixed left panel, "Inventory" heading, 5 nav links (Ingredients · Recipes · Movements · Vendors · Purchase Orders)
- [ ] Low-stock badge: red dot on "Ingredients" nav link + on POS sidebar "Inventory" link if any ingredient is below reorder level
- [ ] Add `/inventory` routes to `apps/pos/src/router.tsx` (manager/owner guard)
- [ ] Add "Inventory" link to POS sidebar nav

### B1-E: Frontend — Ingredients Tab

- [ ] Table columns: Name · Unit · Stock (mini progress bar vs reorderLevel) · Reorder Level · Cost/Unit · Status badge
- [ ] Row click → edit slide-over (right panel)
- [ ] Slide-over fields: name, unit (dropdown), current stock, reorder level, cost per unit, active toggle
- [ ] Amber "Below reorder level" warning banner in slide-over when `currentStock < reorderLevel`
- [ ] "+ Add Ingredient" button → same slide-over in create mode
- [ ] Optimistic updates via TanStack Query mutations

### B1-F: Frontend — Recipes Tab

- [ ] Left panel: menu item list (name, category, veg/non-veg dot) — shows all items, highlights those with a recipe
- [ ] Right panel (on item select): recipe editor
  - Ingredient rows: ingredient picker (searchable dropdown) + qty input + unit label + remove button
  - "+ Add ingredient" link at bottom
- [ ] Margin breakdown card at bottom of right panel:
  - Selling price (from menuItem.price) · Food cost (sum of qty × costPerUnit) · Gross margin (₹ and %)
- [ ] Save recipe button — POST or PATCH depending on whether recipe exists
- [ ] No recipe yet → "Set up recipe" empty state with CTA

### B1-G: Frontend — Movements Tab

- [ ] Filter bar: date range picker · type selector (All / Purchase / Sale / Waste / Adjustment) · ingredient search input
- [ ] 4-stat strip: Total In · Total Out · Waste · Net Change (JetBrains Mono values, color-coded)
- [ ] Ledger table: Date · Ingredient · Type badge · Delta (+ green / − red in Mono) · Note · Recorded By
- [ ] "+ Record Adjustment" button → modal: ingredient picker, type (waste/adjustment), qty, note

---

## Track B2 — Vendors & Purchase Orders

> Sprint 4 (~5 days). Builds on B1 (ingredients must exist first).

### B2-A: Database Schema

- [ ] Add to `apps/server/src/db/schema/inventory.ts`:
  - `vendors` — `id, outletId, name, phone, email, gstin, address, isActive`
  - `purchaseOrders` — `id, outletId, vendorId, status (draft|ordered|partial|received), notes, totalAmount, expectedAt, receivedAt, createdAt`
  - `purchaseOrderItems` — `id, purchaseOrderId, ingredientId, orderedQty, receivedQty, unitCost, note`
- [ ] Add Zod schemas to `packages/shared/src/schemas/inventory.ts`:
  - `createVendorSchema`, `updateVendorSchema`
  - `createPOSchema`, `updatePOSchema`
  - `receivePOSchema` (array of `{ itemId, receivedQty }`)
- [ ] Run `bun drizzle-kit generate` and apply migration

### B2-B: Backend Routes

- [ ] `GET /api/inventory/vendors` — list with `openPOCount` derived
- [ ] `POST /api/inventory/vendors` — create
- [ ] `PATCH /api/inventory/vendors/:id` — update
- [ ] `DELETE /api/inventory/vendors/:id` — soft delete; reject if has open POs
- [ ] `GET /api/inventory/purchase-orders` — list filterable by `?vendorId=&status=&from=&to=`; includes summary stats (counts by status, total value)
- [ ] `GET /api/inventory/purchase-orders/:id` — detail with line items, vendor, activity log
- [ ] `POST /api/inventory/purchase-orders` — create (status: draft); inserts PO + line items
- [ ] `PATCH /api/inventory/purchase-orders/:id` — update notes / expectedAt / line items (draft only)
- [ ] `POST /api/inventory/purchase-orders/:id/order` — draft → ordered; records activity log entry
- [ ] `POST /api/inventory/purchase-orders/:id/receive` — ordered → received:
  - Update `receivedQty` on each line item
  - Increment `ingredients.currentStock` by `receivedQty`
  - Recalculate weighted avg `costPerUnit`: `(existingStock × oldCost + receivedQty × unitCost) / (existingStock + receivedQty)`
  - Insert `stockMovements` rows of type `purchase` per ingredient
  - Set `purchaseOrders.receivedAt = now()`, status → received
  - Record activity log entry

### B2-C: Frontend — Vendors Tab

- [ ] 3-column card grid layout
- [ ] Each card: colored initials avatar (first 2 chars, color seeded from name) · vendor name · phone + email links · GSTIN chip · "Last PO: [date]" · open PO badge (amber if > 0)
- [ ] "+ Add Vendor" button → slide-over: name, phone, email, GSTIN, address
- [ ] Card click → edit slide-over (same form, pre-populated)

### B2-D: Frontend — Purchase Orders List Tab

- [ ] 4 summary stat cards: Draft · Ordered · Received · Total Value (across all open POs)
- [ ] Filter bar: vendor picker · status filter · date range
- [ ] Table: PO# · Vendor · Status chip (with stepper stages) · Items count · Total (Mono) · Expected date · Action button
- [ ] "+ New PO" button → create modal: vendor picker, expected date, line items (ingredient + qty + unit cost rows), notes

### B2-E: Frontend — PO Detail Page (`/inventory/purchase-orders/:id`)

- [ ] Full-page layout (not a tab modal)
- [ ] Top: status stepper — Draft → Ordered → Received (completed = checked, active = highlighted, pending = muted)
- [ ] Main area: line items table — Ingredient · Ordered Qty · Received Qty (editable input when status=ordered) · Unit Cost · Line Total
- [ ] Right sidebar (fixed 280px): vendor card (name, phone, email, GSTIN) + PO metadata (created, expected, notes)
- [ ] Activity timeline at bottom: each status change with timestamp + "Changed by: [name]"
- [ ] Action buttons:
  - Status=draft: "Mark as Ordered" → calls `/order` endpoint
  - Status=ordered: "Mark as Received" → fills `receivedQty` defaults from `orderedQty`, calls `/receive`
  - Status=received: read-only, show "Received on [date]"

---

## Track Q — Queue & Reservation Management

> Walk-in queue first (1 sprint), advance reservations second (1 sprint). Both integrate with the existing floor map + order creation flow.

### Q-A: Database Schema

- [ ] Create `apps/server/src/db/schema/queue.ts` with 2 tables:
  - `queueEntries` — `id, outletId, customerName, customerPhone (nullable), partySize, token (text — e.g. "A12", sequential per day), joinedAt, seatedAt (nullable), cancelledAt (nullable), tableId (nullable FK → tables.id), status (waiting|seated|cancelled|no_show)`
  - `reservations` — `id, outletId, customerName, customerPhone (nullable), partySize, reservedFor (timestamp), tableId (nullable FK → tables.id), status (pending|confirmed|seated|no_show|cancelled), notes (nullable), createdAt`
- [ ] Export from `apps/server/src/db/schema/index.ts`
- [ ] Add Zod schemas to `packages/shared/src/schemas/queue.ts`:
  - `createQueueEntrySchema`, `updateQueueEntrySchema`
  - `createReservationSchema`, `updateReservationSchema`
- [ ] Run `bun drizzle-kit generate` and apply migration

### Q-B: Backend Routes (`apps/server/src/routes/queue.ts`)

**Queue endpoints:**
- [ ] `GET /api/queue` — list today's entries; filter by `?status=waiting` by default; include derived `waitMinutes` (now − joinedAt)
- [ ] `POST /api/queue` — add walk-in entry; auto-generate token (count today's entries + 1, prefix "A"); broadcast `queue.updated` WS event
- [ ] `PATCH /api/queue/:id/seat` — body: `{ tableId }`; validate table is free; set `seatedAt`, `tableId`, `status = seated`; broadcast `queue.updated` + `table.updated`
- [ ] `PATCH /api/queue/:id/cancel` — set `status = cancelled` or `no_show`; broadcast `queue.updated`

**Reservation endpoints:**
- [ ] `GET /api/reservations?date=` — list reservations for a given date (ISO date string); includes `tableId` join for table name
- [ ] `POST /api/reservations` — create; validate no overlapping confirmed reservation on same `tableId` within ±90 min window (if tableId provided)
- [ ] `PATCH /api/reservations/:id` — update any field; re-run overlap check if `tableId` or `reservedFor` changes; broadcast `reservation.updated`
- [ ] `DELETE /api/reservations/:id` — set `status = cancelled`; broadcast `reservation.updated`
- [ ] Mount queue + reservations router in `apps/server/src/index.ts`

**WebSocket events:**
- `queue.updated` — broadcast on any queue entry change; payload: full entry list for today
- `reservation.updated` — broadcast on any reservation change; payload: `{ date, reservations[] }`

### Q-C: Frontend — Queue Panel (FloorPage)

- [ ] Add a collapsible **"Queue"** sidebar panel to the right side of FloorPage
- [ ] Panel header: "Waiting (N)" badge with count; "Add Walk-in" button (opens modal)
- [ ] Add Walk-in modal fields: customer name (required), phone (optional), party size (stepper 1–20)
- [ ] Queue entry card: token chip (amber) · name · party size · wait time (live, updates every minute) · "Seat" button · kebab menu (No-show / Cancel)
- [ ] "Seat" button → opens table picker (only shows free tables with enough capacity) → calls `/seat` endpoint → entry moves to bottom as "Seated" chip for 30 s then disappears
- [ ] Subscribes to `queue.updated` WS event to keep list live

### Q-D: Frontend — Reservations (ManagerPage new tab)

- [ ] Add "Reservations" tab to ManagerPage nav
- [ ] Date picker at top (defaults to today); navigating date fetches that day's reservations
- [ ] Timeline view: 09:00–23:00 in 30-min slots; each reservation shown as a block at its `reservedFor` time, color-coded by status
- [ ] Reservation block: customer name · party size · table name (if assigned) · status chip
- [ ] Click block → edit slide-over: name, phone, party size, date/time, table assignment (dropdown of tables), notes, status selector
- [ ] "+ New Reservation" button → same slide-over in create mode
- [ ] **Floor map integration:** tables with a confirmed reservation within the next 2 hours show a purple dot on the floor plan; hovering shows the reservation tooltip (name, time, party size)

---

## Track AI — AI Features (Tier 1)

> Quick wins using the Claude API. AI1 and AI3 can be built independently; AI2 depends on Track B2 (PO create form).

### AI1: Menu Item Description Generator

**Goal:** When adding/editing a menu item, one click generates a compelling description using Claude.

- [ ] **Backend:** `POST /api/ai/menu-description` — body: `{ name, category, dietaryType (veg|non_veg|egg) }`; calls Claude API (`claude-haiku-4-5-20251001` for cost) with a prompt asking for a 1–2 sentence menu description; returns `{ description: string }`; auth: manager/owner only
- [ ] Add `ANTHROPIC_API_KEY` to server env config and `.env.example`
- [ ] **Frontend:** In `ItemEditPanel` (ManagerPage), add a small "Generate ✦" button next to the description textarea; button calls the endpoint with current name + category; shows spinner while loading; on success, populates the textarea (user can still edit freely)
- [ ] Disable the button if `name` field is empty

### AI2: Vendor Invoice OCR → Auto-fill Purchase Order

**Goal:** Snap a photo of a paper vendor invoice → auto-fill the PO create form. Depends on B2 (PO form must exist first).

- [ ] **Backend:** `POST /api/ai/parse-invoice` — accepts `multipart/form-data` with an image file (JPEG/PNG/PDF); base64-encodes the image; sends to Claude API with vision + a structured prompt asking to extract: `{ vendorName, items: [{ name, quantity, unit, unitCost }] }`; returns parsed JSON; validates with Zod before returning; auth: manager/owner only
- [ ] **Frontend:** In the PO create modal (B2-D), add a "Scan Invoice" button at the top; clicking opens a file picker (accept image/*); on file select, calls the endpoint; on success, auto-populates vendor name field (user matches to existing vendor or creates one) and pre-fills ingredient rows with matched ingredients (fuzzy match on name); unmatched items shown as amber "unrecognized" chips the user can manually map

### AI3: Natural Language Report Queries

**Goal:** Manager/owner can ask plain-language questions about their sales data and get a direct answer.

- [ ] **Backend:** `POST /api/ai/reports-query` — body: `{ question: string }`; server fetches a compact data snapshot (today's totals, this week's top 10 items by revenue, last 7 days daily revenue, current open orders count); sends snapshot + question to Claude API; returns `{ answer: string }`; rate-limit to 20 req/day per outlet to control cost; auth: manager/owner only
- [ ] **Frontend:** Add a persistent **"Ask your data"** input bar at the bottom of the Reports page (or as a floating button); text field with send button; response appears in a card above the input; last 3 Q&A pairs shown (no persistence — session only); typing indicator while awaiting response
- [ ] Show a subtle "Powered by Claude" attribution label under the response card

---

## Routing Plan

```
/inventory                        → redirect → /inventory/ingredients
/inventory/ingredients            → InvIngredients tab (guard: manager/owner)
/inventory/recipes                → InvRecipes tab
/inventory/movements              → InvMovements tab
/inventory/vendors                → InvVendors tab
/inventory/purchase-orders        → InvPOsList tab
/inventory/purchase-orders/:id    → InvPODetail full page

/reservations                     → ManagerPage Reservations tab (guard: manager/owner)
```

---

## Recommended Build Order

| Step | Track | What | Depends On |
|------|-------|------|------------|
| 1 | 0 | Design system CSS integration | — |
| 2 | B1-A | DB schema: ingredients, recipes, recipeIngredients, stockMovements | — |
| 3 | B1-B | Backend: ingredients CRUD + movements + valuation routes | B1-A |
| 4 | B1-D | InventoryPage chrome + routing + sidebar nav | — |
| 5 | B1-E | Ingredients tab UI | B1-B, B1-D |
| 6 | B1-F | Recipes tab UI + backend recipe routes | B1-B, B1-D |
| 7 | B1-C | Post-billing auto-deduct hook + low-stock WS event | B1-A, B1-B |
| 8 | B1-G | Movements tab UI | B1-B, B1-D |
| 9 | 1 | Owner screen visual polish | Track 0 |
| 10 | B2-A | DB schema: vendors, purchaseOrders, purchaseOrderItems | B1-A |
| 11 | B2-B | Backend: vendors + purchase order routes | B2-A |
| 12 | B2-C | Vendors tab UI | B2-B, B1-D |
| 13 | B2-D | PO List tab UI | B2-B, B1-D |
| 14 | B2-E | PO Detail page UI | B2-B, B1-D |
| 15 | Q-A | DB schema: queueEntries, reservations | — |
| 16 | Q-B | Backend: queue + reservations routes + WS events | Q-A |
| 17 | Q-C | Queue panel on FloorPage | Q-B |
| 18 | Q-D | Reservations tab in ManagerPage + floor map dots | Q-B |
| 19 | AI1 | Menu description generator (backend + ItemEditPanel button) | — |
| 20 | AI3 | Natural language reports query (backend + Reports page bar) | — |
| 21 | AI2 | Invoice OCR → PO auto-fill | B2-D, AI1 infra |
