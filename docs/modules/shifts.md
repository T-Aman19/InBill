# Shifts

← [Back to README](../../README.md)

---

## Purpose

Shift management tracks the cash drawer across an operating period. Each shift records opening cash, any cash in/out movements during the shift, and closing cash, allowing managers to reconcile cash at end of day.

---

## Shift Lifecycle

```
Manager opens shift
  └── POST /api/shifts
      body: { openingCash: 5000 }
      Creates shift record with openedAt = now()

  Orders, billing, and cash entries happen during the shift

Manager closes shift
  └── PATCH /api/shifts/:id/close
      body: { closingCash: 8500 }
      Sets closedAt = now()
      Calculates expected cash = openingCash + cashSales − cashOut entries
```

Only one shift can be open at a time per outlet.

---

## Cash Entries

Mid-shift cash movements are recorded as `shiftCashEntries`:

| Type | Example |
|---|---|
| `in` | Petty cash added, advance from owner |
| `out` | Cash paid to a supplier, expense withdrawal |

Each entry has an `amount` and a freetext `note` explaining the reason.

---

## Reconciliation

At shift close, the manager enters the physical cash count (`closingCash`). The system computes:

```
expectedCash = openingCash
             + sum(billPayments where mode = "cash")
             + sum(shiftCashEntries where type = "in")
             - sum(shiftCashEntries where type = "out")

variance = closingCash - expectedCash
```

A positive variance means excess cash (possible counting error or unrecorded income). A negative variance means a shortage. Both are recorded on the shift record for the manager's review.

---

## Shift Report

The summary report (`GET /api/reports/summary`) accepts an optional `shiftId` parameter to scope all metrics to a specific shift, rather than a date range. This gives managers a per-shift view of revenue, bill count, and payment mode breakdown.
