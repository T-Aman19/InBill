# Menu Management

← [Back to README](../../README.md)

---

## Structure

```
Categories (with sort order)
  └─► Menu Items
        ├── Item Variants   (Half / Full, Small / Large, etc.)
        └── Modifier Groups (Add-ons, Toppings, Spice Level, etc.)
                └─► Modifiers (individual options with price)
```

---

## Categories

Categories group menu items on the order screen. They have a configurable sort order that controls display sequence. A category can be reordered via drag-and-drop on the manager page; the server stores the `sortOrder` integer.

---

## Menu Items

Each menu item carries:

| Field | Description |
|---|---|
| `name` | Display name on POS and KOT |
| `basePrice` | Price in paisa (integer, avoids float rounding) |
| `isVeg` | Veg / non-veg indicator (shown as green/red dot on POS) |
| `isAvailable` | Availability toggle — disabled items appear greyed out and cannot be added to orders |
| `taxConfigId` | Link to a tax configuration (CGST/SGST rates) |
| `hsnCode` | HSN code printed on GST receipts |
| `categoryId` | Parent category |

---

## Item Variants

Variants represent size or portion options for the same dish. A variant has a `name` and a `price` that overrides `basePrice` when selected. Examples: Half (₹120) / Full (₹220), Small / Medium / Large.

When a variant is added to an order, `variantName` and `variantPrice` are stored on the `orderItem` row — the historical price is captured at order time, not re-read from the menu later.

---

## Modifier Groups

Modifier groups are optional add-ons presented to staff when adding an item to an order. Each group has:
- A `name` (e.g. "Toppings")
- A `minSelect` / `maxSelect` count
- A list of **modifiers**, each with a name and an additional price

Examples:
- **Add-ons:** Extra cheese (+₹30), Garlic bread (+₹50)
- **Spice level:** Mild (₹0), Medium (₹0), Hot (₹0)

Selected modifiers are stored as `orderItemModifiers` rows and appear on the KOT and receipt.

---

## Availability Toggle (86'ing)

Setting `isAvailable = false` on a menu item (or variant) makes it immediately unavailable across all connected devices via a WebSocket broadcast. The item appears greyed out on the POS and cannot be added to new orders. Existing order items are not affected.

This is the standard restaurant "86'ing" flow — used when a dish runs out mid-service.

---

## QR Menu

Every outlet gets a public-facing menu at `/menu/public?outletId=<id>`. This endpoint requires no authentication and returns all available categories and items.

A QR code pointing to this URL can be printed and placed on tables, allowing customers to browse the menu on their own phones. The QR menu page (`/qr-menu`) renders a read-only, mobile-optimised view — customers cannot place orders through it (that flows through the waiter app).

---

## AI Menu Descriptions

The AI module can generate a marketing-style menu description for any item. Staff provide the item name and cuisine type; the AI returns a 2–3 sentence description suitable for a digital menu board or printed menu.

→ See [AI Features](ai.md)
