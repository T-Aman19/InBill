# Vendors & Purchase Orders

← [Back to README](../../README.md)

---

## Vendor Directory

The vendor directory stores the outlet's supplier contacts. Each vendor record holds:

| Field | Description |
|---|---|
| `name` | Supplier / company name |
| `phone` | Contact number |
| `email` | Contact email |
| `address` | Delivery address or office address |

Vendors are referenced by purchase orders, so deleting a vendor is blocked if open or received POs exist against them.

---

## Purchase Order Lifecycle

```
Draft ──► Ordered ──► Received
```

| Status | Meaning |
|---|---|
| `draft` | PO created, not yet sent to vendor |
| `ordered` | Sent to vendor, awaiting delivery |
| `received` | Goods received; ingredient stock updated |

### Creating a PO

A purchase order is created with:
- A vendor selection
- One or more line items: ingredient, quantity, and unit cost
- An optional expected delivery date

The PO calculates `totalAmount` as the sum of `qty × unitCost` across all lines.

### Receiving a PO

Marking a PO as `received` triggers stock updates for every line item:
- `ingredients.stockQty += purchaseOrderItems.qty` for each line
- A `stockMovements` row of type `purchase` is inserted for each line
- The PO `receivedAt` timestamp is recorded

Partial receipts are not currently supported — the entire PO is received at once.

---

## AI Invoice OCR

The AI module can read a supplier invoice photograph and extract line items — item names, quantities, and unit prices — and pre-fill a new purchase order form. This eliminates manual data entry when receiving paper invoices.

Workflow:
1. Open "New Purchase Order" in the manager panel
2. Tap "Scan Invoice" and upload a photo of the supplier's invoice
3. `POST /api/ai/invoice-ocr` sends the image to the AI
4. The PO form is pre-filled with extracted line items
5. Staff review, correct if needed, and save

The OCR extracts text from the image and maps recognised ingredient names to existing ingredients in the outlet's inventory. Unmatched names are left as free text for staff to reconcile.

→ See [AI Features](ai.md)
