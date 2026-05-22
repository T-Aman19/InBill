# Core POS

← [Back to README](../../README.md)

---

## What It Does

The core POS covers the full table-service workflow — from seating a guest to handing them a receipt — across any number of devices on the local network simultaneously.

---

## Floor Map

The floor map (`/floor`) is the POS home screen. It renders all tables across all floors in real-time, with status derived from live order state:

| Status | Colour | Meaning |
|---|---|---|
| `available` | Green | Table is free |
| `occupied` | Amber | Order open, items not yet sent to kitchen |
| `kot_sent` | Orange | KOT sent, kitchen working on it |
| `served` | Blue | All items ready, awaiting bill |
| `billed` | Red | Bill created, awaiting payment |

Table status is computed at query time from the orders table — it is never stored as a column — so it cannot go stale across device restarts or server reboots.

---

## Order Taking

Tapping a free table navigates to `/order/new?tableId=xxx`. The order record is created lazily — only when the first item is added. This prevents phantom orders from accidental taps.

The order screen splits into:
- **Left panel** — Menu browser (categories → items → variants/modifiers)
- **Right panel** — Current order items with quantities and running total

Each item can carry:
- A **variant** (e.g. Half / Full)
- One or more **modifier groups** (e.g. Spice Level, Add-ons)
- A **kitchen note** typed by staff

Decrementing an item to zero soft-voids it (sets `isVoided = true`) rather than deleting, preserving the KOT audit trail.

---

## Kitchen Order Ticket (KOT)

Tapping "Send to Kitchen" creates a KOT for all unsent items and broadcasts a WebSocket event to the KDS. Items already sent in previous KOTs are excluded.

KOT statuses:
- `pending` — sent, chef has not acknowledged
- `acknowledged` — chef has seen it and is working on it
- `done` — all items on this KOT are ready

When all KOTs for an order are `done`, the order status automatically advances to `served` and the floor map updates on all devices.

---

## Kitchen Display System (KDS)

The KDS screen (`/kds`) is designed for the kitchen and runs on a dedicated display. It shows all active KOTs for the outlet, sorted by creation time (oldest first).

Each KOT card shows:
- Table number and order type (dine-in / takeaway / delivery)
- KOT number and time elapsed since creation
- Every item with quantity and any notes
- Acknowledge and Done buttons

KDS access is restricted to the `kitchen` role.

---

## Billing

The "Bill" button on the order screen is enabled only when:
- At least one item exists on the order
- All items have been sent to the kitchen (no unsent items)
- All KOTs are marked done (no items still being prepared)

`POST /api/bills` validates all three conditions server-side and creates a bill with:
- Itemised breakdown with unit prices
- Per-item tax calculation (CGST + SGST bucketed by tax rate)
- Tax lines stored as JSONB snapshot (so historical bills don't change if tax config changes)
- Subtotal, tax total, discount amount, and final total

---

## Split Payment

The billing page supports multiple payment modes on a single bill. A cashier can record ₹500 cash + ₹300 UPI for a ₹800 bill. Each payment mode creates a separate `billPayments` row. The bill is marked paid when the sum of payments equals the total.

Supported modes: cash, card, UPI, credit.

---

## Order Types

Orders can be created as:
- `dine_in` — requires a table selection
- `takeaway` — no table; customer waiting at counter
- `delivery` — no table; dispatched to a delivery partner

KOT and billing flows are identical across all three types.

---

## Receipt Printing

After a bill is paid, the cashier can print or share a digital receipt. The receipt includes:
- Outlet name, address, GSTIN, and FSSAI number
- Bill number and date
- Itemised list with HSN codes and tax rates
- Tax summary (CGST/SGST per rate slab)
- Payment mode(s)

Receipts are rendered as HTML and printed via the browser's print dialog, so any connected printer works without driver setup.
