# Authentication & Roles

← [Back to README](../README.md)

---

## Login Flow

Staff log in with a PIN, not a password. This keeps the login fast for high-turnover scenarios (shift change, shared tablets).

```
POST /api/auth/login
  body: { pin, outletId }
       │
       │  Lookup users WHERE pin = ? AND outletId = ?
       │  Sign JWT: { userId, outletId, role, name }
       │
       ▼
  JWT stored in localStorage / Zustand auth store
  All API requests: Authorization: Bearer <token>
  Auth middleware validates JWT, sets c.get("user")
```

Owners (multi-outlet access) log in via email + password at a separate `/owner/login` endpoint. The owner JWT carries `ownerId` instead of `outletId` and can query across all their outlets.

---

## Role Permissions Matrix

| Action | owner | manager | cashier | captain | kitchen |
|---|:---:|:---:|:---:|:---:|:---:|
| View floor map | ✓ | ✓ | ✓ | ✓ | — |
| Create / modify orders | ✓ | ✓ | ✓ | ✓ | — |
| Send KOT | ✓ | ✓ | ✓ | ✓ | — |
| Create bill | ✓ | ✓ | ✓ | — | — |
| Apply discounts | ✓ | ✓ | ✓ | — | — |
| View billing page | ✓ | ✓ | ✓ | — | — |
| Manager panel | ✓ | ✓ | — | — | — |
| Manage staff / menu / tables | ✓ | ✓ | — | — | — |
| View reports | ✓ | ✓ | — | — | — |
| Manage inventory / vendors | ✓ | ✓ | — | — | — |
| KDS (kitchen display) | — | — | — | — | ✓ |
| Owner dashboard | ✓ (owner JWT) | — | — | — | — |

---

## Client-Side Route Guards

```
kitchen role  ──► always redirect to /kds
captain role  ──► /floor, /order/:id only
cashier role  ──► /floor, /order/:id, /billing/:id only
manager/owner ──► full access
```

Route guards are enforced in `router.tsx` using TanStack Router's `beforeLoad` hooks. Server-side middleware independently validates role on every protected API call.

---

## Multi-Tenancy Model

```
owners (one per business group / chain)
  └─► outlets (one per physical restaurant location)
            └─► all data: users, floors, tables, menu,
                          orders, kots, bills, shifts,
                          customers, taxConfigs, inventory
```

**Row-level isolation:**
- Every table carries `outletId NOT NULL`
- Auth middleware injects `outletId` from the JWT into every database query
- In Cloud mode, Postgres RLS policies enforce outlet isolation at the database layer
- In Local mode, the server is single-outlet; `outletId` is a compile-time constant

**Owner access:**
- An owner JWT can query across all outlets they own
- The owner dashboard aggregates revenue, orders, and staff across outlets
- Outlet switching requires no re-login — the owner selects the outlet from the dashboard
