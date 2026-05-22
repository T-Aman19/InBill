# Customers & Loyalty

← [Back to README](../../README.md)

---

## Customer Profiles

Customers are looked up and created by phone number. The phone number is the unique identifier — creating a customer with an existing phone number performs an upsert (updates name if changed, otherwise no-op).

Each customer profile stores:

| Field | Description |
|---|---|
| `name` | Customer name |
| `phone` | Primary identifier (unique per outlet) |
| `loyaltyPoints` | Current unredeemed points balance |

The customer profile page (accessible from the manager panel) shows the customer's full order history, total spend, visit count, and current loyalty balance.

---

## Attaching a Customer to an Order

From the order screen, staff can search for a customer by phone number and attach them to the current order. This enables:
- Loyalty points to be earned on this bill
- The bill to appear in the customer's order history
- The customer's name to appear on the KOT and receipt

A customer is optional on any order — walk-in orders without a customer profile are fully supported.

---

## Loyalty Programme

The loyalty programme is configurable per outlet:

| Setting | Description |
|---|---|
| `pointsPerRupee` | Points earned per ₹1 spent (e.g. 1 point per ₹10 = 0.1) |
| `rupeePerPoint` | Redemption rate (e.g. 1 point = ₹0.25) |
| `minRedeemPoints` | Minimum balance required before redemption is allowed |

### Earning Points

Points are credited to the customer's balance when a bill is marked paid. The calculation is:

```
pointsEarned = floor(bill.total × pointsPerRupee)
```

Points are only credited for the billable amount — discounts and taxes are included in `bill.total`, so the customer earns on what they actually pay.

### Redeeming Points

Redemption is initiated from the billing page. The cashier selects "Redeem Points" and enters the number of points to redeem. The system validates:
- Customer has enough points
- Points to redeem meet the `minRedeemPoints` threshold

The redemption converts points to a rupee discount:

```
discountAmount = pointsToRedeem × rupeePerPoint
```

The discount is applied to the bill total, and the customer's points balance is debited. The redemption is recorded in `billPayments` with mode `loyalty`.
