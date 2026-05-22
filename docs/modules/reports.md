# Reports

← [Back to README](../../README.md)

---

## Summary Report

`GET /api/reports/summary?from=&to=`

The daily summary is the manager's first stop. It returns, for the requested date range:
- Total revenue (sum of paid bill totals)
- Number of bills
- Average bill value
- Payment mode breakdown: cash / card / UPI / credit

The payment mode breakdown helps managers reconcile the cash drawer against POS records at end of shift.

---

## Hourly / Daypart Report

`GET /api/reports/hourly?date=`

Returns revenue bucketed by hour for a given day. Useful for identifying peak and off-peak periods for staffing decisions. Data is presented as a heatmap on the manager dashboard.

---

## Item Sales Report

`GET /api/reports/items?from=&to=`

Returns every menu item sold in the date range, ranked by quantity sold, with total revenue per item. Useful for identifying bestsellers and underperformers.

---

## Category Sales Report

`GET /api/reports/categories?from=&to=`

Same as the item report, aggregated by category. Useful for understanding which menu sections drive the most revenue.

---

## GSTR-1 Summary

`GET /api/reports/gstr1?month=&year=`

Returns taxable sales grouped by GST rate slab (5%, 12%, 18%, 28%) for a given month. Each slab shows:
- Total taxable value
- CGST amount
- SGST amount
- IGST amount (for inter-state supplies)

The format matches what accountants need to file GSTR-1. The outlet's GSTIN, business name, and address are included in the response for inclusion on the exported report.

---

## Bills CSV Export

`GET /api/reports/bills/export?from=&to=`

Downloads a CSV file with one row per billed item, including:
- Bill number, date, table number, order type
- Item name, variant, quantity, unit price
- CGST, SGST amounts
- Discount applied
- Payment mode

The CSV can be opened in Excel or imported into accounting software.

---

## Food Cost Report

`GET /api/reports/food-cost?from=&to=`

Compares actual ingredient cost consumed (based on recipes × quantities billed) against total food revenue for the period. Returns:
- Total food revenue
- Total ingredient cost (summed from `stockMovements` of type `sale`)
- Food cost percentage
- Per-item breakdown of cost vs. revenue

A food cost percentage above ~35% signals a pricing or wastage problem.

---

## AI Natural Language Queries

Staff with manager access can ask plain-English questions about their data:

> "What were my top 5 items last Friday?"
> "How much did we make from UPI payments in April?"
> "Which category had the most voids this week?"

The AI translates the question into a SQL query, runs it against the outlet's data, and returns a plain-English answer with a supporting table.

→ See [AI Features](ai.md)
