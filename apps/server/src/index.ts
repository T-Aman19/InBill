import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { config } from "./config.js"
import { wsHandlers } from "./services/ws.js"
import { authRouter } from "./routes/auth.js"
import { menuRouter } from "./routes/menu.js"
import { tablesRouter } from "./routes/tables.js"
import { ordersRouter } from "./routes/orders.js"
import { kotsRouter } from "./routes/kots.js"
import { billingRouter } from "./routes/billing.js"
import { shiftsRouter } from "./routes/shifts.js"
import { reportsRouter } from "./routes/reports.js"
import { usersRouter } from "./routes/users.js"
import { outletRouter } from "./routes/outlet.js"
import { customersRouter } from "./routes/customers.js"
import { discountsRouter } from "./routes/discounts.js"
import { ownerRouter } from "./routes/owner.js"
import { inventoryRouter } from "./routes/inventory.js"
import { vendorsRouter } from "./routes/vendors.js"
import { purchaseOrdersRouter } from "./routes/purchaseOrders.js"
import { aiRouter } from "./routes/ai.js"
import { publicRouter } from "./routes/public.js"
import { loyaltyRouter } from "./routes/loyalty.js"
import { queueRouter } from "./routes/queue.js"
import { runEmbeddedMigrations } from "./db/embedded-migrate.js"

// Run migrations before accepting requests — safe to call on every startup
// (already-applied migrations are skipped). In cloud mode the host runs
// `bun run db:migrate` separately, but in local/desktop mode this is the
// only migration path because the migrations folder is embedded in the binary.
await runEmbeddedMigrations()

const app = new Hono()

app.use("*", logger())
app.use(
  "/api/*",
  cors({
    origin: config.isLocal ? "*" : ["https://inbill.app", "https://pos.inbill.app", "capacitor://localhost"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
)

// API routes
const api = app.basePath("/api")
api.route("/auth", authRouter)
api.route("/menu", menuRouter)
api.route("/tables", tablesRouter)
api.route("/orders", ordersRouter)
api.route("/kots", kotsRouter)
api.route("/bills", billingRouter)
api.route("/shifts", shiftsRouter)
api.route("/reports", reportsRouter)
api.route("/users", usersRouter)
api.route("/outlet", outletRouter)
api.route("/customers", customersRouter)
api.route("/discounts", discountsRouter)
api.route("/owner", ownerRouter)
api.route("/inventory", inventoryRouter)
api.route("/vendors", vendorsRouter)
api.route("/purchase-orders", purchaseOrdersRouter)
api.route("/ai", aiRouter)
api.route("/public", publicRouter)
api.route("/loyalty", loyaltyRouter)
api.route("/queue", queueRouter)

// Health check
app.get("/health", (c) => c.json({ status: "ok", mode: config.mode, ts: new Date().toISOString() }))

// Serve captain mobile app at /mobile
// rewriteRequestPath strips the /mobile prefix so serveStatic looks up
// dist/assets/foo.js instead of dist/mobile/assets/foo.js
app.use("/mobile/*", serveStatic({
  root: config.static.mobile,
  rewriteRequestPath: (path) => path.replace(/^\/mobile/, "") || "/",
}))
app.get("/mobile", (c) => c.redirect("/mobile/"))
// SPA fallback: client-side routes like /mobile/floor serve index.html
app.get("/mobile/*", async (c) => {
  const indexFile = Bun.file(`${config.static.mobile}/index.html`)
  if (!(await indexFile.exists())) return c.notFound()
  return c.html(await indexFile.text())
})

// Serve host app at /host
app.use("/host/*", serveStatic({
  root: config.static.host,
  rewriteRequestPath: (path) => path.replace(/^\/host/, "") || "/",
}))
app.get("/host", (c) => c.redirect("/host/"))
app.get("/host/*", async (c) => {
  const indexFile = Bun.file(`${config.static.host}/index.html`)
  if (!(await indexFile.exists())) return c.notFound()
  return c.html(await indexFile.text())
})

// Serve POS UI at / — static assets first, then SPA fallback for client-side routes
app.use("/*", serveStatic({ root: config.static.pos }))

// SPA fallback: any unmatched route (e.g. /menu/:outletId/:tableId) gets index.html
// so client-side routing works when the URL is opened directly on a device
app.get("/*", async (c) => {
  const indexFile = Bun.file(`${config.static.pos}/index.html`)
  if (!(await indexFile.exists())) return c.notFound()
  return c.html(await indexFile.text())
})

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  return c.json({ error: "Internal server error" }, 500)
})

const server = Bun.serve({
  port: config.port,
  hostname: '0.0.0.0',

  fetch(req, srv) {
    const url = new URL(req.url)

    // Intercept WebSocket upgrade before Hono sees it
    if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
      const outletId = url.searchParams.get("outletId") ?? "unknown"
      const upgraded = srv.upgrade(req, { data: { outletId, rooms: new Set<string>() } })
      if (upgraded) return undefined
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    return app.fetch(req, srv)
  },

  websocket: {
    open: wsHandlers.open,
    message: wsHandlers.message,
    close: wsHandlers.close,
  },
})

console.log(`InBill server running on http://localhost:${server.port} [${config.mode} mode]`)
