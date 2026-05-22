# API Reference

← [Back to README](../README.md)

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <jwt>`.

---

## Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Login with PIN, returns JWT |
| `GET` | `/auth/me` | Current user from token |
| `POST` | `/owner/login` | Owner login with email + password |

---

## Menu

| Method | Path | Description |
|---|---|---|
| `GET` | `/menu/categories` | List categories |
| `POST` | `/menu/categories` | Create category |
| `PATCH` | `/menu/categories/:id` | Rename / reorder category |
| `DELETE` | `/menu/categories/:id` | Delete category |
| `GET` | `/menu/items` | List items with category, variants, and modifiers |
| `POST` | `/menu/items` | Create item |
| `PATCH` | `/menu/items/:id` | Update item (price, availability, tax config) |
| `DELETE` | `/menu/items/:id` | Delete item |
| `GET` | `/menu/public` | Public menu (no auth) — used by QR menu |

---

## Tables

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

---

## Orders

| Method | Path | Description |
|---|---|---|
| `POST` | `/orders` | Create order (rejects if table already occupied) |
| `GET` | `/orders/:id` | Get order with KOT status per item |
| `POST` | `/orders/:id/items` | Add item to order |
| `PATCH` | `/orders/:id/items/:itemId/decrement` | Decrement qty; voids at 0 |
| `POST` | `/orders/:id/kot` | Generate KOT for unsent items |

---

## KOTs (Kitchen)

| Method | Path | Description |
|---|---|---|
| `GET` | `/kots` | Active KOTs (pending + acknowledged) for KDS |
| `PATCH` | `/kots/:id/acknowledge` | Acknowledge KOT |
| `PATCH` | `/kots/:id/done` | Mark KOT done; advances order status when all done |

---

## Billing

| Method | Path | Description |
|---|---|---|
| `POST` | `/bills` | Create bill (validates no open KOTs / unsent items) |
| `GET` | `/bills/:id` | Get bill with itemised breakdown and tax lines |
| `PATCH` | `/bills/:id/pay` | Record payment, mark paid |
| `PATCH` | `/bills/:id/discount` | Apply or remove a discount |

---

## Discounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/discounts` | List discounts for outlet |
| `POST` | `/discounts` | Create discount (flat or percent, optional coupon code) |
| `PATCH` | `/discounts/:id` | Update discount |
| `DELETE` | `/discounts/:id` | Delete discount |
| `POST` | `/discounts/validate` | Validate coupon code for an order value |

---

## Shifts

| Method | Path | Description |
|---|---|---|
| `GET` | `/shifts/current` | Current open shift |
| `POST` | `/shifts` | Open shift with opening cash amount |
| `PATCH` | `/shifts/:id/close` | Close shift with closing cash amount |
| `POST` | `/shifts/:id/cash` | Add cash-in or cash-out entry |

---

## Reports

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/summary` | Revenue, bill count, avg bill for date range |
| `GET` | `/reports/gstr1` | GSTR-1 summary grouped by tax rate |
| `GET` | `/reports/bills/export` | Itemised bills as CSV download |
| `GET` | `/reports/hourly` | Hourly / daypart revenue heatmap |
| `GET` | `/reports/items` | Item-level sales ranking |
| `GET` | `/reports/categories` | Category-level sales ranking |
| `GET` | `/reports/food-cost` | Actual food cost vs. sales for date range |

---

## Inventory

| Method | Path | Description |
|---|---|---|
| `GET` | `/inventory/ingredients` | List ingredients with current stock |
| `POST` | `/inventory/ingredients` | Create ingredient |
| `PATCH` | `/inventory/ingredients/:id` | Update ingredient (name, unit, reorder level) |
| `DELETE` | `/inventory/ingredients/:id` | Delete ingredient |
| `POST` | `/inventory/ingredients/:id/adjust` | Manual stock adjustment |
| `GET` | `/inventory/recipes` | List recipes (ingredient linkages per menu item) |
| `POST` | `/inventory/recipes` | Link ingredient to menu item with qty |
| `DELETE` | `/inventory/recipes/:id` | Unlink ingredient |
| `GET` | `/inventory/movements` | Stock movement history |

---

## Vendors

| Method | Path | Description |
|---|---|---|
| `GET` | `/vendors` | List vendors |
| `POST` | `/vendors` | Create vendor |
| `PATCH` | `/vendors/:id` | Update vendor |
| `DELETE` | `/vendors/:id` | Delete vendor |

---

## Purchase Orders

| Method | Path | Description |
|---|---|---|
| `GET` | `/purchase-orders` | List purchase orders |
| `POST` | `/purchase-orders` | Create purchase order (draft) |
| `GET` | `/purchase-orders/:id` | Get PO with line items |
| `PATCH` | `/purchase-orders/:id/order` | Mark as ordered (sent to vendor) |
| `PATCH` | `/purchase-orders/:id/receive` | Receive PO (updates ingredient stock) |

---

## Customers

| Method | Path | Description |
|---|---|---|
| `GET` | `/customers` | List / search customers |
| `POST` | `/customers` | Create customer (upsert on phone number) |
| `GET` | `/customers/:id` | Customer profile + order history |
| `PATCH` | `/customers/:id` | Update customer details |

---

## Loyalty

| Method | Path | Description |
|---|---|---|
| `GET` | `/loyalty/program` | Get loyalty programme settings |
| `PATCH` | `/loyalty/program` | Update earn rate, burn rate, minimum redemption |
| `POST` | `/loyalty/redeem` | Redeem points against a bill |

---

## AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/menu-description` | Generate menu item description from name + cuisine |
| `POST` | `/ai/invoice-ocr` | Extract line items from invoice image → PO prefill |
| `POST` | `/ai/report-query` | Natural language report query |

---

## Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List staff for outlet |
| `POST` | `/users` | Create staff member |
| `PATCH` | `/users/:id` | Update staff member (role, PIN, name) |
| `DELETE` | `/users/:id` | Delete staff member |

---

## Outlet

| Method | Path | Description |
|---|---|---|
| `GET` | `/outlet` | Get outlet settings |
| `PATCH` | `/outlet` | Update name, address, GSTIN, phone, tax settings |

---

## Owner

| Method | Path | Description |
|---|---|---|
| `GET` | `/owner/outlets` | List all outlets for the authenticated owner |
| `GET` | `/owner/dashboard` | Aggregated revenue and order stats across outlets |
| `POST` | `/owner/outlets` | Create a new outlet |
