# Architecture

← [Back to README](../README.md)

---

## Deployment Modes

InBill ships in two distinct modes that share the same codebase and API surface.

### Cloud Mode

Devices connect directly to a Railway-hosted cloud server over HTTPS. No hardware setup required.

```
[Browser / Phone] ──HTTPS──► [Railway Server] ──► [Neon PostgreSQL]
```

Best for: small cafes, cloud kitchens, ghost kitchens that want zero infrastructure.

### Local (Pro) Mode

One outlet PC runs a Tauri desktop app that bundles a Bun server and a PostgreSQL database. Every device on the LAN connects via the browser. A background worker syncs to the cloud in the background.

```
[Phone / Tablet / PC] ──LAN HTTP──► [Tauri Desktop App]
                                           │
                                   [Bun Server + pg_embed]
                                           │
                                   [Local PostgreSQL DB]
                                           │
                                [Background Sync Worker]
                                           │
                                   [Neon Cloud DB]  ◄── (analytics / backup)
```

Best for: high-volume restaurants, chains, areas with unreliable internet.

---

## Monorepo Structure

```
InBill/
├── apps/
│   ├── server/          Bun + Hono API server (runs locally OR on Railway)
│   │   └── src/
│   │       ├── db/
│   │       │   ├── schema/      Drizzle table definitions
│   │       │   └── migrations/  SQL migrations
│   │       ├── routes/          API route handlers (one file per domain)
│   │       ├── services/        WebSocket handler
│   │       ├── middleware/      Auth middleware (JWT)
│   │       └── lib/             Shared query helpers, types
│   ├── pos/             React + Vite POS UI (cashier / manager screen)
│   │   └── src/
│   │       ├── pages/           FloorPage, OrderPage, BillingPage, KdsPage, ManagerPage
│   │       ├── components/ui/   Shared UI primitives
│   │       ├── stores/          Zustand auth store
│   │       ├── lib/             API client, WebSocket client, utils
│   │       └── router.tsx       TanStack Router route tree
│   ├── mobile/          Flutter Web waiter app (served at /mobile)
│   └── desktop/         Tauri wrapper (starts server + PostgreSQL, .msi installer)
├── packages/
│   └── shared/          Zod schemas + TypeScript types (shared by server & pos)
├── turbo.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP framework | Hono |
| ORM | Drizzle ORM |
| Database (local) | PostgreSQL via pg_embed (bundled in Tauri) |
| Database (cloud) | Neon PostgreSQL |
| POS UI | React 18 + Vite + TanStack Router + Zustand + TanStack Query + Tailwind CSS + shadcn/ui |
| Waiter app | Flutter Web (PWA, served at `/mobile`) |
| Desktop wrapper | Tauri (.msi for Windows, .dmg for macOS) |
| Cloud deploy | Railway (server) + Neon (database) |
| Monorepo tooling | Turborepo + Bun workspaces |
| Real-time | WebSocket (Bun built-in, orchestrated by Hono) |
| Offline sync | Outbox pattern (`sync_events` table + background worker) |
| Validation | Zod (shared schemas in `packages/shared`) |

---

## System Diagrams

### Cloud Mode

```
┌─────────────────────────────────────────────────────────────┐
│                     Devices (LAN or internet)                │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  POS Browser │  │ KDS Browser  │  │  Waiter (Flutter) │ │
│  │  /           │  │  /kds        │  │  /mobile          │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘ │
└─────────┼─────────────────┼─────────────────────┼───────────┘
          │  HTTPS REST      │  WebSocket /ws       │
          ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Railway Cloud Server                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Hono (Bun)                        │   │
│  │  /api/*  ──► Route handlers (auth / menu / orders / │   │
│  │               kots / billing / shifts / reports /    │   │
│  │               users / outlet / customers)            │   │
│  │  /ws     ──► WebSocket upgrade & broadcast           │   │
│  │  /       ──► Serve POS React build (static)          │   │
│  │  /mobile ──► Serve Flutter Web build (static)        │   │
│  └──────────────────────────┬───────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────┘
                              │ Drizzle ORM
                              ▼
                    ┌─────────────────┐
                    │  Neon PostgreSQL │
                    └─────────────────┘
```

### Local (Pro) Mode

```
┌──────────────────────────────────────────────────────────────┐
│                         LAN Devices                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │   POS    │  │   KDS    │  │  Waiter  │  │  Manager   │  │
│  │ Browser  │  │ Browser  │  │  Phone   │  │  Browser   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
└───────┼─────────────┼─────────────┼───────────────┼─────────┘
        │             │  HTTP on LAN │               │
        ▼             ▼              ▼               ▼
┌───────────────────────────────────────────────────────────────┐
│                  Tauri Desktop App (outlet PC)                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Bun Server (Hono)                      │  │
│  │   Same API surface as cloud, config.mode = "local"      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │             Local PostgreSQL (pg_embed)                  │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│                             │                                  │
│  ┌──────────────────────────▼──────────────────────────────┐  │
│  │          Background Sync Worker (outbox pattern)         │  │
│  │  Reads sync_events table → replays to Neon cloud DB      │  │
│  └──────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────┘
                              │ (async, survives internet outage)
                              ▼
                    ┌──────────────────┐
                    │  Neon Cloud DB   │
                    │  (analytics /    │
                    │   backup / BI)   │
                    └──────────────────┘
```
