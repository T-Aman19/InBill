# InBill — Restaurant POS Platform

**The POS that works when the internet doesn't.**

InBill is a modern, browser-first point-of-sale platform built for Indian restaurants. Any device on your local network — phone, tablet, laptop — becomes a POS terminal the moment you open a browser. No app installs, no per-device fees, no internet dependency.

---

## The Problem

Indian restaurant operators are stuck with POS software that was designed in a different era:

| Pain point | Reality |
|---|---|
| **App install on every device** | Staff turnover means constant reinstalls; tablets get stolen |
| **No real offline mode** | One internet hiccup halts billing mid-rush |
| **Per-device or per-outlet pricing** | A 3-outlet chain pays 3× for the same feature set |
| **Fragmented tools** | Separate apps for POS, inventory, CRM, and reports that never talk to each other |
| **Legacy UX** | Competitors built in the 2000s; training new staff takes days |

**The result:** Restaurants overpay for software that slows them down at exactly the wrong moment.

---

## The Solution

InBill is a single platform that covers the full restaurant operations stack — orders, kitchen display, billing, inventory, vendors, loyalty, and reports — in a browser-first architecture that runs entirely on your local network.

- **Any device, zero install.** The server runs on one PC at the outlet. Every phone and tablet on the LAN connects via the browser.
- **True offline operation.** Local PostgreSQL handles all writes. A background worker syncs to the cloud when connectivity returns.
- **Flat pricing.** One subscription per outlet, unlimited devices and staff seats.
- **Indian-first compliance.** GST per tax slab (CGST/SGST/IGST), HSN codes, GSTIN on receipts, and GSTR-1 export — built in, not bolted on.

---

## Key Features

### Operations
- Floor map with real-time table status
- Dine-in, takeaway, and delivery order types
- Kitchen Display System (KDS) with per-KOT acknowledgement
- Split payment — cash, card, UPI, credit — on one bill
- Digital receipts with full GST itemisation

### Menu & Modifiers
- Category and item management with sort order
- Item variants (e.g. half / full) and add-on modifier groups
- Per-item availability toggle (86'ing) synced to all devices
- QR menu for customers to browse without staff interaction

### Inventory & Supply Chain
- Ingredient-level stock tracking with unit conversions
- Recipe linking — auto-deducts stock when an item is billed
- Low-stock alerts broadcast in real-time to all devices
- Vendor directory with purchase order lifecycle (draft → ordered → received)
- AI-powered invoice OCR to pre-fill POs from a supplier photo

### Customers & Loyalty
- Customer profiles with phone-based lookup and order history
- Points-based loyalty programme with configurable earn/burn rates
- Redemption tracked at the bill level

### Reports & Compliance
- Daily summary with revenue, bill count, and average bill value
- Payment-mode breakdown (cash vs. UPI vs. card)
- GSTR-1 summary export
- Itemised bills CSV export
- Hourly / daypart sales heatmap
- Item and category sales rankings
- Food cost report (actual cost vs. sales)
- Natural language report query powered by AI ("What were my top 5 items last Friday?")

### AI
- Menu description generator from item name + cuisine type
- Invoice OCR → purchase order pre-fill
- Natural language analytics queries

### Platform & Multi-Outlet
- Owner dashboard with cross-outlet visibility
- Role-based access: owner / manager / cashier / captain / kitchen
- Shift management with opening and closing cash
- Onboarding wizard + setup checklist for new outlets

---

## Modules

| Module | Description |
|---|---|
| [Core POS](docs/modules/pos.md) | Floor map, order taking, KOT, KDS, billing, split payment, receipts |
| [Menu Management](docs/modules/menu.md) | Categories, items, variants, modifiers, availability, QR menu |
| [Inventory](docs/modules/inventory.md) | Ingredients, recipes, stock movements, auto-deduction, alerts |
| [Vendors & Purchase Orders](docs/modules/vendors.md) | Vendor directory, PO lifecycle, AI invoice OCR |
| [Customers & Loyalty](docs/modules/crm.md) | Customer profiles, order history, loyalty points |
| [Discounts](docs/modules/discounts.md) | Coupon codes, bill-level discounts, discount audit trail |
| [Reports](docs/modules/reports.md) | Sales reports, GSTR-1, food cost, CSV export, AI queries |
| [AI Features](docs/modules/ai.md) | Menu description generator, invoice OCR, NL reports |
| [Owner Dashboard](docs/modules/owner.md) | Multi-outlet management, cross-outlet analytics |
| [Shifts](docs/modules/shifts.md) | Shift open/close, cash drawer entries, reconciliation |

---

## Technical Docs

| Document | Contents |
|---|---|
| [Architecture](docs/architecture.md) | Deployment modes, monorepo structure, tech stack, system diagrams |
| [Database Schema](docs/database-schema.md) | Full entity-relationship overview |
| [Process Flows](docs/process-flows.md) | Order lifecycle, KOT flow, billing flow, WebSocket events, offline sync |
| [Auth & Roles](docs/auth-and-roles.md) | Authentication, role permissions matrix, multi-tenancy model |
| [API Reference](docs/api-reference.md) | All REST endpoints with methods and descriptions |
| [Getting Started](docs/getting-started.md) | Local dev setup, environment variables, production build |

---

## Deployment at a Glance

InBill ships in two modes:

**Cloud (Starter)** — Zero hardware. Devices connect to a Railway-hosted server over HTTPS. Best for small cafes and cloud kitchens.

**Local (Pro)** — One outlet PC runs a Tauri desktop app that bundles the server and a local PostgreSQL database. Every device on the LAN connects via browser. Syncs to the cloud in the background. Best for high-volume restaurants and areas with unreliable internet.

→ [Full architecture details](docs/architecture.md)

---

## Quick Start

```bash
bun install
cp apps/server/.env.example apps/server/.env
# set DATABASE_URL, JWT_SECRET, MODE
cd apps/server && bun run db:migrate
bun run dev
```

→ [Full setup guide](docs/getting-started.md)
