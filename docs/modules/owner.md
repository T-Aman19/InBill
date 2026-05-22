# Owner Dashboard

← [Back to README](../../README.md)

---

## Overview

The owner dashboard is a separate view from the per-outlet POS. It gives restaurant group owners and chain operators a single place to monitor all their outlets without switching logins.

Owners authenticate via email + password at `/owner/login`. The owner JWT carries `ownerId` (not `outletId`) and is authorised to query across all outlets the owner controls.

---

## Cross-Outlet Visibility

The dashboard aggregates key metrics across all outlets for a selected date range:

- **Revenue** — total across all outlets, with per-outlet breakdown
- **Bill count** — total and per-outlet
- **Average bill value** — per-outlet comparison
- **Payment mode mix** — how much of revenue is cash vs. digital per outlet
- **Top-selling items** — ranked across the entire group

This lets an owner immediately spot which outlet is underperforming or which item is driving disproportionate revenue at one location.

---

## Outlet Management

From the owner dashboard, an owner can:
- **Create a new outlet** — sets up the outlet record, default tax config, and a manager user
- **View outlet details** — address, GSTIN, phone, current active staff
- **Switch into an outlet's POS** — the owner can operate as a manager at any of their outlets without a separate PIN login

---

## Multi-Outlet Data Isolation

Despite cross-outlet visibility at the owner level, data isolation is strictly maintained:
- Staff at one outlet cannot see orders, customers, or inventory from another outlet
- The owner JWT is the only credential that can query across outlets
- In Cloud mode, Postgres RLS policies enforce this at the database layer

---

## Onboarding Wizard

New outlets are walked through a setup checklist on first login:

1. Set outlet name, address, GSTIN, and phone
2. Configure tax rates (CGST/SGST slabs)
3. Create at least one floor and table
4. Add at least one menu category and item
5. Create staff PINs for each role

The checklist tracks completion status and persists across sessions. The POS is fully usable before the checklist is complete — it's a guide, not a gate.
