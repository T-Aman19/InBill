# Process Flows

← [Back to README](../README.md)

---

## Order Lifecycle

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
  Cashier selects payment mode(s), confirms
  bill.isPaid ─► true
  table.status ─► "available"
```

---

## KOT & Kitchen Display Flow

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

---

## Billing Flow

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
                 │  Select payment mode(s)
                 │  (cash / card / UPI / credit)
                 │  Split across multiple modes supported
                 ▼
  PATCH /api/bills/:id/pay
  ├── Inserts into billPayments (one row per mode)
  ├── bills.isPaid = true
  ├── tables.status = "available"
  └── WS broadcast: table.updated
                 │
                 ▼
  Navigate back to FloorPage
  Table appears free again
```

---

## WebSocket Event Model

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

  inventory.low  ──► payload: { ingredientId, name, stockQty }
                     Consumers: ManagerPage (low-stock banner)
```

```
Server broadcast logic (services/ws.ts):

  broadcast(outletId, event, payload)
       │
       ├── Iterates all connected sockets
       └── Sends to sockets where socket.data.outletId === outletId
```

---

## Offline Sync (Outbox Pattern)

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

The outbox guarantees **at-least-once delivery** to the cloud. Events are processed in creation order, so the cloud database always converges to the correct state once connectivity is restored.
