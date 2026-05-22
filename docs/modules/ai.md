# AI Features

← [Back to README](../../README.md)

---

InBill's AI features are powered by the Anthropic Claude API. All three features require `ANTHROPIC_API_KEY` to be set in the server environment.

---

## Menu Description Generator

`POST /api/ai/menu-description`

Generates a short, appetising description for a menu item — suitable for a digital menu board, printed menu, or aggregator listing.

**Input:**
```json
{
  "itemName": "Butter Chicken",
  "cuisine": "North Indian",
  "isVeg": false
}
```

**Output:**
```json
{
  "description": "Tender chicken slow-cooked in a rich, velvety tomato-butter gravy with aromatic spices. A timeless North Indian classic, perfect with naan or jeera rice."
}
```

The generated description is editable before saving. It is stored on the menu item and displayed on the QR menu.

---

## Invoice OCR → Purchase Order Pre-fill

`POST /api/ai/invoice-ocr`

Accepts a base64-encoded image of a supplier invoice and extracts line items: item name, quantity, and unit price.

**Input:**
```json
{
  "imageBase64": "..."
}
```

**Output:**
```json
{
  "vendorName": "Ram Traders",
  "lineItems": [
    { "name": "Chicken Breast", "qty": 10, "unit": "kg", "unitCost": 280 },
    { "name": "Tomato", "qty": 5, "unit": "kg", "unitCost": 40 }
  ]
}
```

The POS UI maps extracted names to existing ingredients in the outlet's inventory (fuzzy match on name). Unmatched items are flagged for manual selection. Staff review and confirm before the PO is saved.

---

## Natural Language Report Queries

`POST /api/ai/report-query`

Translates a plain-English question into a SQL query, executes it against the outlet's data, and returns a human-readable answer.

**Input:**
```json
{
  "question": "What were my top 5 selling items last week?"
}
```

**Output:**
```json
{
  "answer": "Your top 5 items last week by quantity sold were: Butter Chicken (143), Garlic Naan (138), Dal Makhani (97), Paneer Tikka (84), and Biryani (79).",
  "table": [
    { "item": "Butter Chicken", "qty": 143, "revenue": 42900 },
    ...
  ]
}
```

The AI has access only to data scoped to the authenticated outlet — it cannot query data from other outlets. The generated SQL is validated against a schema whitelist before execution to prevent injection.

---

## Privacy & Data

- No customer PII (names, phone numbers) is sent to the AI for the report query feature. Queries are parameterised; customer identifiers stay in the database.
- Invoice images are processed once and not stored by Anthropic.
- AI-generated menu descriptions are stored locally and can be edited or deleted by the outlet owner.
