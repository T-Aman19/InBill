# Database Schema

← [Back to README](../README.md)

---

All tables are outlet-scoped. Every record carries an `outletId` foreign key, enforced at the application layer (and via Postgres RLS in cloud mode).

---

## Entity Relationship Overview

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
                    │             isAvailable,
                    │             hsnCode)
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
                                   ├──► billPayments
                                   │    (billId, mode:
                                   │     cash|card|upi|credit,
                                   │     amount, reference)
                                   │
                                   └──► billDiscounts
                                        (billId, discountId,
                                         amountDeducted, appliedBy)

        outlets ──► discounts
                    (id, outletId, code, type:
                     flat|percent, value,
                     minOrderValue, maxUses,
                     usedCount, isActive)

        outlets ──► shifts
                    (id, outletId, openedById, closedById,
                     openingCash, closingCash,
                     openedAt, closedAt)
                         │
                         └──► shiftCashEntries
                              (shiftId, type: in|out,
                               amount, note)

        outlets ──► ingredients
                    (id, outletId, name, unit,
                     stockQty, reorderLevel, costPerUnit)
                         │
                         └──► recipes
                              (menuItemId, ingredientId,
                               qtyUsed)

        outlets ──► vendors
                    (id, outletId, name, phone,
                     email, address)
                         │
                         └──► purchaseOrders
                              (id, outletId, vendorId,
                               status: draft|ordered|received,
                               totalAmount)
                                   │
                                   └──► purchaseOrderItems
                                        (poId, ingredientId,
                                         qty, unitCost)

        outlets ──► loyaltyProgram
                    (outletId, pointsPerRupee,
                     rupeePerPoint, minRedeemPoints)

        outlets ──► sync_events      (outbox for cloud sync)
                    (id, outletId, tableName,
                     rowId, operation, payload,
                     syncedAt)
```

---

## Key Design Decisions

**Table status is derived, not stored.** `tables.status` is computed from the live order state at query time, never written directly, which prevents stale status bugs across device restarts.

**Tax lines are stored as JSONB.** Each bill captures a snapshot of `taxLines` (an array of `{ name, rate, amount }`) at billing time. This means historical bills remain accurate even if the outlet's tax configuration changes later.

**Soft-void on order items.** Decrementing an item quantity to zero sets `isVoided = true` rather than deleting the row. This preserves the KOT audit trail.

**Outbox for cloud sync.** Every write in Local mode appends a row to `sync_events`. A background worker drains the outbox asynchronously, so internet outages never block local operations.
