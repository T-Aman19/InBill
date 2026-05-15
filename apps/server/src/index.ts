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

const app = new Hono()

app.use("*", logger())
app.use(
  "/api/*",
  cors({
    origin: config.isLocal ? "*" : ["https://inbill.app", "https://pos.inbill.app"],
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

// Health check
app.get("/health", (c) => c.json({ status: "ok", mode: config.mode, ts: new Date().toISOString() }))

// Serve Flutter waiter app at /mobile
app.use("/mobile/*", serveStatic({ root: config.static.mobile }))
app.get("/mobile", (c) => c.redirect("/mobile/index.html"))

// Serve POS UI at / (must be last)
app.use("/*", serveStatic({ root: config.static.pos }))

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error(err)
  return c.json({ error: "Internal server error" }, 500)
})

const server = Bun.serve({
  port: config.port,

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
