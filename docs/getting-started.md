# Getting Started

← [Back to README](../README.md)

---

## Prerequisites

- [Bun](https://bun.sh) >= 1.1
- PostgreSQL (local dev) or a [Neon](https://neon.tech) connection string (cloud)
- Node.js is not required — Bun handles everything

---

## 1. Install Dependencies

```bash
bun install
```

---

## 2. Configure Environment

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env` and set at minimum:

```env
DATABASE_URL=postgres://user:pass@localhost/inbill
JWT_SECRET=your-long-random-secret
MODE=cloud
```

See [Environment Variables](#environment-variables) below for the full list.

---

## 3. Run Migrations

```bash
cd apps/server
bun run db:migrate
```

---

## 4. Seed Demo Data (optional)

```bash
cd apps/server
bun run db:seed
```

This creates a demo outlet, sample menu, and a set of staff users for each role.

---

## 5. Start Development Servers

```bash
bun run dev
```

Turborepo starts both servers in parallel:
- **API server** → `http://localhost:3000`
- **POS Vite dev server** → `http://localhost:5173`

In development, Vite proxies `/api` and `/ws` to the Bun server, so you only ever navigate to `http://localhost:5173`.

---

## Production Build

```bash
bun run build
```

- Server compiles to `apps/server/dist`
- POS bundles to `apps/pos/dist` (served as static files by the server)

To run the production build:

```bash
cd apps/server
bun run start
```

The server serves the POS static build at `/` and the Flutter web build at `/mobile`.

---

## Environment Variables

All variables live in `apps/server/.env`.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgres://user:pass@host/db` |
| `JWT_SECRET` | Secret for signing JWTs | any long random string |
| `MODE` | `cloud` or `local` | `cloud` |
| `PORT` | Server port | `3000` |
| `STATIC_POS` | Path to built POS assets | `../../apps/pos/dist` |
| `STATIC_MOBILE` | Path to built Flutter web assets | `../../apps/mobile/build/web` |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI features | `sk-ant-...` |
| `RAZORPAY_KEY_ID` | Razorpay key ID for UPI payments | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | — |

**Mode differences:**

In `local` mode:
- Server binds on `0.0.0.0` (LAN-accessible)
- CORS is open to `*`
- Outbox sync worker starts on boot

In `cloud` mode:
- CORS is restricted to `inbill.app` origins
- `DATABASE_URL` should point to Neon

---

## Flutter Waiter App (optional)

The waiter app is a Flutter Web build served at `/mobile`. To build it:

```bash
cd apps/mobile
flutter build web
```

The output lands at `apps/mobile/build/web`. Point `STATIC_MOBILE` to this path.

---

## Desktop App (Local Pro Mode)

The Tauri desktop wrapper bundles the Bun server and a local PostgreSQL instance into a single installer.

```bash
cd apps/desktop
bun run tauri build
```

This produces:
- `.msi` installer for Windows
- `.dmg` for macOS

The installer registers the app as a startup service so the server starts automatically when the outlet PC boots.
