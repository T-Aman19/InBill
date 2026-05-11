# InBill — Restaurant POS Platform

A modern, browser-first point-of-sale platform for restaurants. Any device on the local network works as a POS terminal with no per-device installs. Built as a superior alternative to PetPooja, DotPe, and Rista.

---

## Table of Contents

- [Why InBill](#why-inbill)
- [Deployment Modes](#deployment-modes)
- [Monorepo Structure](#monorepo-structure)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
  - [Cloud Mode](#cloud-mode-architecture)
  - [Local (Pro) Mode](#local-pro-mode-architecture)
  - [Database Schema](#database-schema)
- [Process Flows](#process-flows)
  - [Order Lifecycle](#order-lifecycle)
  - [KOT & Kitchen Display Flow](#kot--kitchen-display-flow)
  - [Billing Flow](#billing-flow)
  - [WebSocket Event Model](#websocket-event-model)
  - [Offline Sync (Outbox Pattern)](#offline-sync-outbox-pattern)
  - [Authentication & Role-Based Access](#authentication--role-based-access)
  - [Multi-Tenancy Model](#multi-tenancy-model)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)

---

## Why InBill

| Problem with competitors | InBill's approach |
|---|---|
| Native app required on every device | Single server; any browser on LAN works |
| No real offline support | Local PostgreSQL + background cloud sync |
| Internet outage kills the restaurant | Full offline operation with Tauri desktop wrapper |
| Expensive per-device or per-outlet pricing | Self-hosted local option (one server, unlimited devices) |

---

## Deployment Modes

### Cloud (Starter)

Devices connect directly to Anthropic Railway-hosted cloud. Zero install, zero hardware setup.

```
[Browser/Phone] ──HTTPS──► [Railway Server] ──► [Neon PostgreSQL]
```

Best for: small cafes, cloud kitchens, ghost kitchens.

### Local (Pro)

One outlet PC runs a Tauri desktop app that bundles a Bun server + PostgreSQL. Every device on the LAN connects via browser. Syncs to cloud in the background.

```
[Phone/Tablet/PC] ──LAN HTTP──► [Tauri Desktop App]
                                       │
                               [Bun Server + pg_embed]
                                       │
                               [Local PostgreSQL DB]
                                       │
                            [Background Sync Worker]
                                       │
                               [Neon Cloud DB]  ◄── (analytics / backup)
```

Best for: large restaurants, chains, areas with unreliable internet.

---

## Monorepo Structure

```
InBill/
├── apps/
│   ├── server/          Bun + Hono API server (runs locally OR on Railway)
│   │   └── src/
│   │       ├── db/
│   │       │   ├── schema/      Drizzle table definitions
│   │       │   └── migrations/  SQL migrations
│   │       ├── routes/          API route handlers (one file per domain)
│   │       ├── services/        WebSocket handler
│   │       ├── middleware/      Auth middleware (JWT)
│   │       └── lib/             Shared query helpers, types
│   ├── pos/             React + Vite POS UI (cashier/manager screen)
│   │   └── src/
│   │       ├── pages/           FloorPage, OrderPage, BillingPage, KdsPage, ManagerPage
│   │       ├── components/ui/   Shared UI primitives
│   │       ├── stores/          Zustand auth store
│   │       ├── lib/             API client, WebSocket client, utils
│   │       └── router.tsx       TanStack Router route tree
│   ├── mobile/          Flutter Web waiter app (served at /mobile)
│   └── desktop/         Tauri wrapper (starts server + PostgreSQL, .msi installer)
├── packages/
│   └── shared/          Zod schemas + TypeScript types (shared by server & pos)
├── turbo.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP framework | Hono |
| ORM | Drizzle ORM |
| Database (local) | PostgreSQL via pg_embed (bundled in Tauri) |
| Database (cloud) | Neon PostgreSQL |
| POS UI | React 18 + Vite + TanStack Router + Zustand + TanStack Query + Tailwind CSS + shadcn/ui |
| Waiter app | Flutter Web (PWA, served at `/mobile`) |
| Desktop wrapper | Tauri (.msi for Windows, .dmg for macOS) |
| Cloud deploy | Railway (server) + Neon (database) |
| Monorepo tooling | Turborepo + Bun workspaces |
| Real-time | WebSocket (Bun built-in, orchestrated by Hono) |
| Offline sync | Outbox pattern (`sync_events` table + background worker) |
| Validation | Zod (shared schemas in `packages/shared`) |

---

## Architecture

### Cloud Mode Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Devices (LAN or internet)             │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  POS Browser │  │ KDS Browser  │  │  Waiter (Flutter) │ │
│  │  /           │  │  /kds        │  │  /mobile          │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘ │
└─────────┼─────────────────┼───────────────────-─┼───────────┘
          │  HTTPS REST      │  WebSocket /ws       │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Railway Cloud Server                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Hono (Bun)                        │   │
│  │  /api/*  ──► Route handlers (auth / menu / orders / │   │
│  │               kots / billing / shifts / reports /    │   │
│  │               users / outlet / customers)            │   │
│  │  /ws     ──► WebSocket upgrade & broadcast           │   │
│  │  /       ──► Serve POS React build (static)          │   │
│  │  /mobile ──► Serve Flutter Web build (static)        │   │
│  └──────────────────────────┬───────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────┘
                              │ Drizzle ORM
                              ▼
                    ┌─────────────────┐
                    │  Neon PostgreSQL │
                    └─────────────────┘
```

### Local (Pro) Mode Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         LAN Devices                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │   POS    │  │   KDS    │  │  Waiter  │  │  Manager   │  │
│  │ Browser  │  │ Browser  │  │  Phone   │  │  Browser   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
└───────┼─────────────┼─────────────┼───────────────┼─────────┘
        │             │  HTTP on LAN │               │
        ▼             ▼              ▼               ▼
┌───────────────────────────────────────────────────────────────┐
│                  Tauri Desktop App (outlet PC)                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Bun Server (Hono)                      │  │
│  │   Same API surface as cloud, config.mode = "local"      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │             Local PostgreSQL (pg_embed)                  │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │          Background Sync Worker (outbox pattern)         │  │
│  │  Reads sync_events table → replays to Neon cloud DB      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────┘
                              │ (async, survives internet outage)
                              ▼
                    ┌──────────────────┐
                    │  Neon Cloud DB   │
                    │  (analytics /    │
                    │   backup / BI)   │
                    └──────────────────┘
```

### Database Schema

```
owners ──────────────────────────────────┐
  id, name, email, passwordHash, phone   │
  │                                      │
  └─► outlets                            │
        id, ownerId, name, address,      │
        phone, gstin, timezone, currency │
              │                          │
    ┌─────────┼──────────────────────────┤
    │         │                          │
    ▼         ▼                          ▼
  users     floors                  taxConfigs
  (pin      (id, outletId,          (id, outletId,
  login,     name, sortOrder)        name, cgst%,
  role)          │                   sgst%, igst%)
                 │                        │
                 ▼                        │
               tables                    │
               (id, floorId,             │
                capacity, status,        │
                currentOrderId)          │
                    │                    │
                    │            categories
                    │            (id, outletId,
                    │             name, sortOrder)
                    │                    │
                    │                    ▼
                    │            menuItems
                    │            (id, categoryId,
                    │             taxConfigId, name,
                    │             basePrice, isVeg,
                    │             isAvailable)
                    │              │        │
                    │              │        ├──► itemVariants
                    │              │        │    (id, itemId, name, price)
                    │              │        │
                    │              │        └──► menuItemModifierGroups
                    │              │                  │
                    │              │          modifierGroups ──► modifiers
                    │              │
                    │           customers
                    │           (id, outletId,
                    │            name, phone,
                    │            loyaltyPoints)
                    │
                    ▼
                  orders
                  (id, outletId, tableId,
                   customerId, serverId,
                   type: dine_in|takeaway|delivery,
                   status: open|kot_sent|served|billed|cancelled,
                   guestCount)
                       │
              ┌────────┴──────────┐
              │                   │
              ▼                   ▼
          orderItems            kots
          (id, orderId,         (id, orderId, outletId,
           kotId, menuItemId,    kotNumber,
           variantId, name,      status: pending|
           variantName,                  acknowledged|
           unitPrice, qty,               done)
           notes, isVoided)
              │
              └──► orderItemModifiers
                   (orderItemId, modifierId,
                    name, price)

        orders (billed) ──► bills
                             (id, orderId, billNumber,
                              subtotal, taxLines JSONB,
                              taxTotal, discountAmount,
                              total, isPaid)
                                   │
                                   └──► billPayments
                                        (billId, mode:
                                         cash|card|upi|credit,
                                         amount, reference)

        outlets ──► shifts
                    (id, outletId, openedById, closedById,
                     openingCash, closingCash,
                     openedAt, closedAt)
                         │
                         └──► shiftCashEntries
                              (shiftId, type: in|out,
                               amount, note)

        outlets ──► sync_events      (outbox for cloud sync)
                    (id, outletId, tableName,
                     rowId, operation, payload,
                     syncedAt)
```

---

## Process Flows

### Order Lifecycle

```
Staff opens floor map (FloorPage)
         │
         │  GET /api/tables
         │  (status derived from live order state, never stale column)
         ▼
  ┌──────────────┐      table occupied?
  │  Table grid  │─────────────────────► Navigate to existing order
  └──────┬───────┘
         │ click free table
         ▼
  Navigate to /order/new?tableId=xxx
  (NO order created yet — lazy creation)
         │
         │ staff adds first item
         ▼
  POST /api/orders   ← order created now
  POST /api/orders/:id/items
  ┌──────────────────────────────────┐
  │         OrderPage                │
  │  Menu panel  │  Order items      │
  │  (left)      │  (right)          │
  │              │                   │
  │  + item ────►│  item added       │
  │  - item ────►│  qty decremented  │
  │              │  (voided if → 0)  │
  └──────────────┴───────────────────┘
         │
         │ "Send to Kitchen" (POST /api/orders/:id/kot)
         ▼
  KOT created (status: pending)
  order.status ─► "kot_sent"
  WS broadcast: order.updated
         │
         ▼
  KDS receives KOT (GET /api/kots polls or WS push)
  Chef acknowledges ─► status: "acknowledged"
  Chef marks done  ─► status: "done"
                       All KOTs done?
                            │ yes
                            ▼
                    order.status ─► "served"
                    WS: order.updated
         │
         │ Cashier sees all items "Ready" (green)
         │ "Bill" button enabled
         ▼
  POST /api/bills
  (validates: no unsent items, no open KOTs)
  bill created, order.status ─► "billed"
  table.status ─► "billed"
  WS: order.updated, table.updated
         │
         ▼
  BillingPage (/billing/:billId)
  Cashier selects payment mode, confirms
  bill.isPaid ─► true
  table.status ─► "available"
```

### KOT & Kitchen Display Flow

```
                    OrderPage                     KDS (KdsPage)
                       │                               │
  Staff taps           │                               │
  "Send to Kitchen"    │                               │
          │            │                               │
          ▼            │                               │
  POST /api/orders/:id/kot                             │
          │                                            │
          │  Inserts kots row (status: pending)        │
          │  Links orderItems.kotId                    │
          │  Broadcasts WS: order.updated              │
          │                                            │
          │                                    ┌───────┴──────────┐
          │                                    │  Kitchen screen  │
          │                                    │  GET /api/kots   │
          │                                    │  (pending +      │
          │                                    │   acknowledged)  │
          │                                    └───────┬──────────┘
          │                                            │
          │                               Chef taps "Acknowledge"
          │                               PATCH /api/kots/:id/acknowledge
          │                               status ─► "acknowledged"
          │                               WS: order.updated
          │
          │  OrderPage item shows "In kitchen" (amber)
          │
          │                               Chef taps "Done"
          │                               PATCH /api/kots/:id/done
          │                               status ─► "done"
          │                               All KOTs done for order?
          │                                    │ yes
          │                                    ▼
          │                               order.status ─► "served"
          │                               WS: order.updated
          │
          ▼
  OrderPage item shows "Ready" (green)
  Bill button unlocked
```

### Billing Flow

```
BillingPage (/billing/:billId)
       │
       │  GET /api/bills/:id
       │  (itemised list, subtotal, taxLines JSONB, total)
       │
       ▼
  ┌────────────────────────────┐
  │  Bill summary display      │
  │  • Items + quantities      │
  │  • Subtotal                │
  │  • Tax lines (CGST/SGST)   │
  │  • Discount (if any)       │
  │  • Total                   │
  └──────────────┬─────────────┘
                 │
                 │  Select payment mode
                 │  (cash / card / UPI / credit)
                 ▼
  PATCH /api/bills/:id/pay
  ├── Inserts into billPayments
  ├── bills.isPaid = true
  ├── tables.status = "available"
  └── WS broadcast: table.updated
                 │
                 ▼
  Navigate back to FloorPage
  Table appears free again
```

### WebSocket Event Model

All real-time updates flow through a single `/ws` endpoint. Clients subscribe to their `outletId` room on connect.

```
Client connects: ws://host/ws?outletId=<id>
Server adds socket to outlet room

Event types broadcast by server:

  order.created  ──► payload: { orderId, tableId, type }
                     Consumers: FloorPage (update table status)

  order.updated  ──► payload: full order object with enriched
                     kotStatus per item + billId when billed
                     Consumers: OrderPage (live item status),
                                FloorPage (table total/badge)

  table.updated  ──► payload: { tableId, status }
                     Consumers: FloorPage (re-render table tile)

Client → Server messages (planned):
  join_room  — subscribe to specific order room for focused updates
```

```
Server broadcast logic (services/ws.ts):

  broadcast(outletId, event, payload)
       │
       ├── Iterates all connected sockets
       └── Sends to sockets where socket.data.outletId === outletId
```

### Offline Sync (Outbox Pattern)

Used in Local (Pro) mode to sync to the cloud without blocking local operations.

```
Local write (e.g. POST /api/orders)
       │
       ├──► Insert into local PostgreSQL (immediate, synchronous)
       │
       └──► Append to sync_events table:
            { tableName, rowId, operation: INSERT|UPDATE|DELETE,
              payload: JSON, syncedAt: null }

Background sync worker (runs every N seconds):
       │
       │  SELECT * FROM sync_events WHERE syncedAt IS NULL
       │  ORDER BY createdAt ASC
       │
       ├── For each event:
       │     ├── POST to cloud API / direct Neon write
       │     └── UPDATE sync_events SET syncedAt = now()
       │
       └── On cloud unreachable:
             Events accumulate in local DB
             Worker retries on next tick
             Local operations continue unaffected
```

### Authentication & Role-Based Access

**Login flow:**

```
POST /api/auth/login
  body: { pin, outletId }
       │
       │  Lookup users WHERE pin = ? AND outletId = ?
       │  Sign JWT: { userId, outletId, role, name }
       │
       ▼
  JWT stored in localStorage / Zustand auth store
  All API requests: Authorization: Bearer <token>
  Auth middleware validates JWT, sets c.get("user")
```

**Role permissions matrix:**

| Action | owner | manager | cashier | captain | kitchen |
|---|:---:|:---:|:---:|:---:|:---:|
| View floor map | ✓ | ✓ | ✓ | ✓ | — |
| Create / modify orders | ✓ | ✓ | ✓ | ✓ | — |
| Send KOT | ✓ | ✓ | ✓ | ✓ | — |
| Create bill | ✓ | ✓ | ✓ | — | — |
| View billing page | ✓ | ✓ | ✓ | — | — |
| Manager panel | ✓ | ✓ | — | — | — |
| Manage staff / menu / tables | ✓ | ✓ | — | — | — |
| KDS (kitchen display) | — | — | — | — | ✓ |
| View reports | ✓ | ✓ | — | — | — |

**Client-side routing guards (router.tsx):**

```
kitchen role  ──► always redirect to /kds
captain role  ──► /floor, /order/:id only
cashier role  ──► /floor, /order/:id, /billing/:id only
manager/owner ──► full access
```

### Multi-Tenancy Model

```
owners (one per business group / chain)
  └─► outlets (one per physical restaurant location)
            └─► all data: users, floors, tables, menu,
                          orders, kots, bills, shifts,
                          customers, taxConfigs

Row-level isolation:
  • Every table has outletId NOT NULL
  • Auth middleware injects outletId into every query
  • Cloud: Postgres RLS policies enforce outlet isolation
  • Local: single-outlet server, outletId is a constant

Owner dashboard (planned):
  • Owner JWT can query across all their outlets
  • Outlet switching without re-login
```

---

## API Reference

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <jwt>`.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Login with PIN, returns JWT |
| `GET` | `/auth/me` | Current user from token |

### Menu
| Method | Path | Description |
|---|---|---|
| `GET` | `/menu/categories` | List categories |
| `POST` | `/menu/categories` | Create category |
| `PATCH` | `/menu/categories/:id` | Rename category |
| `DELETE` | `/menu/categories/:id` | Delete category |
| `GET` | `/menu/items` | List items with category |
| `POST` | `/menu/items` | Create item |
| `PATCH` | `/menu/items/:id` | Update item |
| `DELETE` | `/menu/items/:id` | Delete item |

### Tables
| Method | Path | Description |
|---|---|---|
| `GET` | `/tables` | List tables with live status (derived from orders) |
| `POST` | `/tables` | Create table |
| `PATCH` | `/tables/:id` | Update table |
| `DELETE` | `/tables/:id` | Delete table |
| `GET` | `/tables/floors` | List floors |
| `POST` | `/tables/floors` | Create floor |
| `PATCH` | `/tables/floors/:id` | Rename floor |
| `DELETE` | `/tables/floors/:id` | Delete floor (rejects if tables exist) |

### Orders
| Method | Path | Description |
|---|---|---|
| `POST` | `/orders` | Create order (rejects if table already occupied) |
| `GET` | `/orders/:id` | Get order with KOT status per item |
| `POST` | `/orders/:id/items` | Add item to order |
| `PATCH` | `/orders/:id/items/:itemId/decrement` | Decrement qty; voids at 0 |
| `POST` | `/orders/:id/kot` | Generate KOT for unsent items |

### KOTs (Kitchen)
| Method | Path | Description |
|---|---|---|
| `GET` | `/kots` | Active KOTs (pending + acknowledged) for KDS |
| `PATCH` | `/kots/:id/acknowledge` | Acknowledge KOT |
| `PATCH` | `/kots/:id/done` | Mark KOT done; advances order when all done |

### Billing
| Method | Path | Description |
|---|---|---|
| `POST` | `/bills` | Create bill (validates no open KOTs / unsent items) |
| `GET` | `/bills/:id` | Get bill with itemised breakdown |
| `PATCH` | `/bills/:id/pay` | Record payment, mark paid |

### Shifts
| Method | Path | Description |
|---|---|---|
| `GET` | `/shifts/current` | Current open shift |
| `POST` | `/shifts` | Open shift (opening cash) |
| `PATCH` | `/shifts/:id/close` | Close shift (closing cash) |

### Reports
| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/summary` | Revenue, bill count, avg bill for date range |

### Users
| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List staff for outlet |
| `POST` | `/users` | Create staff member |
| `PATCH` | `/users/:id` | Update staff member |
| `DELETE` | `/users/:id` | Delete staff member |

### Outlet
| Method | Path | Description |
|---|---|---|
| `GET` | `/outlet` | Get outlet settings |
| `PATCH` | `/outlet` | Update name, address, GSTIN, phone |

### Customers
| Method | Path | Description |
|---|---|---|
| `GET` | `/customers` | List / search customers |
| `POST` | `/customers` | Create customer (upsert on phone) |
| `GET` | `/customers/:id` | Profile + order history |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- PostgreSQL (local) or a [Neon](https://neon.tech) connection string (cloud)
- Node.js is not required — Bun handles everything

### Install dependencies

```bash
bun install
```

### Configure environment

```bash
cp apps/server/.env.example apps/server/.env
# edit DATABASE_URL, JWT_SECRET, MODE
```

### Run migrations

```bash
cd apps/server
bun run db:migrate
```

### Seed demo data (optional)

```bash
cd apps/server
bun run db:seed
```

### Development (all apps in parallel)

```bash
bun run dev
# Turborepo starts server (port 3000) + POS Vite dev server (port 5173)
```

### Production build

```bash
bun run build
# Server: compiled to apps/server/dist
# POS:    built to apps/pos/dist  (served as static by server)
```

---

## Environment Variables

All variables live in `apps/server/.env`.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://user:pass@host/db` |
| `JWT_SECRET` | Secret for signing JWTs | any long random string |
| `MODE` | `cloud` or `local` | `cloud` |
| `PORT` | Server port | `3000` |
| `STATIC_POS` | Path to built POS assets | `../../apps/pos/dist` |
| `STATIC_MOBILE` | Path to built Flutter web assets | `../../apps/mobile/build/web` |

In `local` mode the server binds on `0.0.0.0` (LAN-accessible) and CORS is open to `*`.  
In `cloud` mode CORS is restricted to `inbill.app` origins and the server expects `DATABASE_URL` to point to Neon.
