# Discounts

← [Back to README](../../README.md)

---

## Discount Types

InBill supports two discount types, both configurable per outlet:

| Type | Description | Example |
|---|---|---|
| `flat` | Fixed rupee amount off the bill total | ₹50 off |
| `percent` | Percentage off the bill subtotal (before tax) | 10% off |

Discounts can optionally carry:
- A **coupon code** — staff or customers enter this at billing time
- A **minimum order value** — discount is invalid if the bill is below this amount
- A **max uses** cap — the discount auto-deactivates once the usage limit is hit

---

## Applying a Discount

From the billing page, a manager or cashier can:
1. Select a configured discount from the list, or
2. Enter a coupon code (validated against `POST /api/discounts/validate`)

`PATCH /api/bills/:id/discount` applies the discount:
- Recalculates `bills.discountAmount`
- Recalculates `bills.total`
- Inserts a `billDiscounts` audit row recording which discount was applied, by whom, and how much was deducted

---

## Audit Trail

Every applied discount is recorded in the `billDiscounts` table:

| Field | Description |
|---|---|
| `billId` | The bill it was applied to |
| `discountId` | The discount configuration used |
| `amountDeducted` | Actual rupee amount removed from the bill |
| `appliedBy` | User ID of the staff member who applied it |
| `appliedAt` | Timestamp |

This audit log appears in the manager panel's discount report and is exportable with the bills CSV export.

---

## Usage Limits

If a discount has `maxUses` set, the `usedCount` column is incremented every time the discount is successfully applied to a paid bill. Once `usedCount >= maxUses`, the discount is automatically deactivated and returns an error on validation.

Managers can reset or increase `maxUses` from the discount management panel.
