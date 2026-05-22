# Inventory

← [Back to README](../../README.md)

---

## Overview

InBill tracks stock at the ingredient level. Recipes link menu items to ingredients, enabling automatic stock deduction when an item is billed. Low-stock alerts fire in real-time to all connected manager devices.

---

## Ingredients

Each ingredient represents a raw material held in the kitchen store:

| Field | Description |
|---|---|
| `name` | E.g. "Chicken Breast", "Maida", "Tomato" |
| `unit` | Unit of measurement: `kg`, `g`, `L`, `ml`, `pcs`, `dozen` |
| `stockQty` | Current quantity on hand (in the chosen unit) |
| `reorderLevel` | Threshold below which a low-stock alert is triggered |
| `costPerUnit` | Purchase cost per unit — used in the food cost report |

Stock quantity is updated by:
1. **Receiving a purchase order** — adds the received quantity
2. **Billing an order** — deducts recipe quantities for each billed item
3. **Manual adjustment** — waste recording, spot-check corrections

---

## Stock Movements

Every change to stock quantity creates a `stockMovements` row with a type:

| Type | Trigger |
|---|---|
| `purchase` | PO received |
| `sale` | Order billed (auto-deduction) |
| `waste` | Manual waste entry |
| `adjustment` | Manual correction (positive or negative) |

The movement log is the source of truth for auditing what happened to stock. The current `stockQty` on the ingredient is the running balance.

---

## Recipes

A recipe links a menu item to one or more ingredients, specifying how much of each ingredient is consumed when one unit of the item is sold.

Example: "Butter Chicken (Full)" consumes:
- 250g Chicken Breast
- 50g Butter
- 30ml Cream
- 10g Spice Mix

When a bill is created and marked paid, InBill iterates every billed item, looks up its recipe, and deducts the proportional ingredient quantities. Variants are supported: a "Half" portion can have a separate recipe with 125g chicken instead of 250g.

---

## Low-Stock Alerts

When a stock deduction brings any ingredient below its `reorderLevel`, the server broadcasts an `inventory.low` WebSocket event to all connected manager-role devices. The manager page displays a banner listing all ingredients at or below reorder level.

---

## Auto-Deduction Flow

```
Bill paid (PATCH /api/bills/:id/pay)
       │
       ├── For each orderItem (non-voided):
       │     ├── Look up recipe for menuItemId + variantId
       │     ├── For each recipe line:
       │     │     ├── stockQty -= (qtyUsed × orderItem.qty)
       │     │     ├── Insert stockMovements row (type: sale)
       │     │     └── If stockQty < reorderLevel:
       │     │             broadcast inventory.low
       │     └── (skip items with no recipe)
       └── Continue with normal billing completion
```

Items without a recipe are skipped silently — not every menu item needs to track ingredient-level stock.
