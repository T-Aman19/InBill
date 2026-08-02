import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { networkInterfaces } from "os"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index.js"
import { config } from "../config.js"
import {
  outlets, categories, menuItems,
  modifierGroups, modifiers, menuSchedules,
  orders, orderItems, orderItemModifiers, tables,
} from "../db/schema/index.js"
import { broadcastOutlet } from "../services/ws.js"
import { fireKots } from "../lib/kot.js"
import { isScheduleActiveNow } from "../lib/schedule.js"

// Effective schedule for an item: its own wins, else its category's.
// Returns null when the item has no (active) schedule attached.
async function buildScheduleResolver(outletId: string) {
  const [scheduleRows, catRows] = await Promise.all([
    db.query.menuSchedules.findMany({ where: eq(menuSchedules.outletId, outletId) }),
    db.query.categories.findMany({ where: eq(categories.outletId, outletId), columns: { id: true, scheduleId: true } }),
  ])
  const scheduleMap = new Map(scheduleRows.map((s) => [s.id, { ...s, activeNow: isScheduleActiveNow(s) }]))
  const catScheduleMap = new Map(catRows.map((cat) => [cat.id, cat.scheduleId]))
  return (item: { scheduleId: string | null; categoryId: string }) => {
    const sid = item.scheduleId ?? catScheduleMap.get(item.categoryId) ?? null
    const schedule = sid ? scheduleMap.get(sid) : null
    return schedule?.isActive ? schedule : null
  }
}

const discounted = (price: string, percentOff: number) =>
  percentOff > 0 ? (Number(price) * (1 - percentOff / 100)).toFixed(2) : price

export const publicRouter = new Hono()

// Simple in-memory rate limiter (60 req/min per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 60) return false
  entry.count++
  return true
}

publicRouter.use("*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? "unknown"
  if (!checkRateLimit(ip)) return c.json({ error: "Too many requests" }, 429)
  await next()
})

// GET /api/public/menu/:outletId
publicRouter.get("/menu/:outletId", async (c) => {
  const { outletId } = c.req.param()

  const outlet = await db.query.outlets.findFirst({
    where: and(eq(outlets.id, outletId), eq(outlets.isActive, true)),
    columns: { id: true, name: true, address: true },
  })
  if (!outlet) return c.json({ error: "Not found" }, 404)

  const [cats, items, links, groups, mods] = await Promise.all([
    db.query.categories.findMany({
      where: and(eq(categories.outletId, outletId), eq(categories.isActive, true)),
      orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)],
    }),
    db.query.menuItems.findMany({
      where: and(eq(menuItems.outletId, outletId), eq(menuItems.isAvailable, true)),
      with: { variants: { where: (v, { eq: veq }) => veq(v.isActive, true) } },
      orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)],
    }),
    db.query.menuItemModifierGroups.findMany(),
    db.query.modifierGroups.findMany({ where: eq(modifierGroups.outletId, outletId) }),
    db.query.modifiers.findMany({ where: eq(modifiers.isActive, true) }),
  ])

  const groupMap = new Map(groups.map((g) => [g.id, { ...g, modifiers: mods.filter((m) => m.groupId === g.id) }]))
  const itemGroupIds = new Map<string, string[]>()
  for (const link of links) {
    const ids = itemGroupIds.get(link.itemId) ?? []
    ids.push(link.groupId)
    itemGroupIds.set(link.itemId, ids)
  }

  // Hide items whose schedule window is closed right now; reprice happy-hour items
  const scheduleFor = await buildScheduleResolver(outletId)

  const enrichedItems = items
    .filter((item) => {
      const schedule = scheduleFor(item)
      return !schedule || schedule.activeNow
    })
    .map((item) => {
      const schedule = scheduleFor(item)
      const percentOff = schedule ? Number(schedule.percentOff) : 0
      return {
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        basePrice: discounted(item.basePrice, percentOff),
        isVeg: item.isVeg,
        imageUrl: item.imageUrl,
        variants: item.variants.map((v) => ({ ...v, price: discounted(v.price, percentOff) })),
        modifierGroups: (itemGroupIds.get(item.id) ?? []).map((gid) => groupMap.get(gid)).filter(Boolean),
        scheduleName: schedule && percentOff > 0 ? schedule.name : null,
      }
    })

  return c.json({ outlet, categories: cats, items: enrichedItems })
})

const publicOrderSchema = z.object({
  outletId: z.string().uuid(),
  tableId: z.string().uuid(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        quantity: z.number().int().positive().max(999),
        notes: z.string().max(500).optional(),
        modifierIds: z.array(z.string().uuid()).max(20).optional(),
      }),
    )
    .min(1)
    .max(50),
})

// POST /api/public/orders — place or append a QR-sourced order, then auto-fire KOT
publicRouter.post("/orders", zValidator("json", publicOrderSchema), async (c) => {
  const { outletId, tableId, items: cartItems } = c.req.valid("json")

  const [outlet, table] = await Promise.all([
    db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.isActive, true)) }),
    db.query.tables.findFirst({ where: and(eq(tables.id, tableId), eq(tables.outletId, outletId)) }),
  ])
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)
  if (!table) return c.json({ error: "Table not found" }, 404)
  if (table.status === "billed") return c.json({ error: "Table is awaiting payment — please ask staff to assist" }, 409)

  // Resolve item prices from the menu
  const menuItemIds = [...new Set(cartItems.map((i) => i.menuItemId))]
  const menuItemRows = await db.query.menuItems.findMany({
    where: (m, { and: mand, inArray, eq: meq }) => mand(inArray(m.id, menuItemIds), meq(m.outletId, outletId)),
    with: { variants: true },
  })
  const menuMap = new Map(menuItemRows.map((m) => [m.id, m]))

  const scheduleFor = await buildScheduleResolver(outletId)

  for (const item of cartItems) {
    const mi = menuMap.get(item.menuItemId)
    if (!mi) return c.json({ error: `Item not found: ${item.menuItemId}` }, 400)
    // A supplied variant must actually belong to (and be active on) this item —
    // otherwise it would be stored at the base price with no variant name.
    if (item.variantId && !mi.variants.some((v) => v.id === item.variantId && v.isActive)) {
      return c.json({ error: "Selected variant is not available for this item" }, 400)
    }
    const schedule = scheduleFor(mi)
    if (schedule && !schedule.activeNow) {
      return c.json({ error: `"${mi.name}" is only available during ${schedule.name} (${schedule.startTime}–${schedule.endTime})` }, 400)
    }
  }

  // Re-use existing order if table is already occupied, otherwise create a new one
  let order: { id: string; outletId: string; tableId: string | null; status: string } | undefined
  let isNewOrder = false

  if (table.currentOrderId && table.status === "occupied") {
    const existing = await db.query.orders.findFirst({
      where: and(eq(orders.id, table.currentOrderId), eq(orders.outletId, outletId)),
    })
    if (existing && existing.status !== "cancelled") {
      order = existing
    }
  }

  if (!order) {
    const [created] = await db
      .insert(orders)
      .values({ outletId, tableId, type: "dine_in", source: "qr", updatedAt: new Date() })
      .returning()
    if (!created) return c.json({ error: "Failed to create order" }, 500)
    order = created
    isNewOrder = true
  }

  // Insert order items
  for (const cartItem of cartItems) {
    const menuItem = menuMap.get(cartItem.menuItemId)!
    const variant = cartItem.variantId ? menuItem.variants.find((v) => v.id === cartItem.variantId) : null
    const schedule = scheduleFor(menuItem)
    const percentOff = schedule?.activeNow ? Number(schedule.percentOff) : 0
    const unitPrice = discounted(variant ? variant.price : menuItem.basePrice, percentOff)
    const name = menuItem.name
    const variantName = variant?.name ?? null

    const [orderItem] = await db
      .insert(orderItems)
      .values({ orderId: order.id, menuItemId: cartItem.menuItemId, variantId: cartItem.variantId ?? null, name, variantName, unitPrice, quantity: cartItem.quantity, notes: cartItem.notes ?? null })
      .returning()

    if (orderItem) {
      if (cartItem.modifierIds?.length) {
        const modRows = await db.query.modifiers.findMany({
          where: (m, { inArray }) => inArray(m.id, cartItem.modifierIds!),
        })
        if (modRows.length > 0) {
          await db.insert(orderItemModifiers).values(
            modRows.map((m) => ({ orderItemId: orderItem.id, modifierId: m.id, name: m.name, price: m.price })),
          )
        }
      }
    }
  }

  // Auto-fire KOTs for the newly added items — split one ticket per kitchen station
  await fireKots({ outletId, orderId: order.id, orderSource: "qr" })

  if (isNewOrder) {
    await db.update(tables).set({ status: "occupied", currentOrderId: order.id }).where(eq(tables.id, tableId))
    broadcastOutlet(outletId, { type: "table.status", payload: { id: tableId, status: "occupied", currentOrderId: order.id } })
    broadcastOutlet(outletId, { type: "order.created", payload: order as never })
  } else {
    broadcastOutlet(outletId, { type: "order.updated", payload: order as never })
  }

  return c.json({ orderId: order.id }, isNewOrder ? 201 : 200)
})

// GET /api/public/table/:tableId?outletId= — check table status and get existing order items
publicRouter.get("/table/:tableId", async (c) => {
  const { tableId } = c.req.param()
  const outletId = c.req.query("outletId")
  if (!outletId) return c.json({ error: "outletId required" }, 400)

  const table = await db.query.tables.findFirst({
    where: and(eq(tables.id, tableId), eq(tables.outletId, outletId)),
    columns: { id: true, status: true, currentOrderId: true },
  })
  if (!table) return c.json({ error: "Table not found" }, 404)

  if (table.currentOrderId && table.status === "occupied") {
    const existingItems = await db.query.orderItems.findMany({
      where: and(eq(orderItems.orderId, table.currentOrderId), eq(orderItems.isVoided, false)),
      with: { modifiers: true },
    })
    return c.json({ status: table.status, orderId: table.currentOrderId, items: existingItems })
  }

  return c.json({ status: table.status, orderId: null, items: [] })
})

// GET /api/public/orders/:id/status?outletId=
publicRouter.get("/orders/:id/status", async (c) => {
  const { id } = c.req.param()
  const outletId = c.req.query("outletId")
  if (!outletId) return c.json({ error: "outletId required" }, 400)

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.outletId, outletId)),
    columns: { id: true, status: true },
  })
  if (!order) return c.json({ error: "Not found" }, 404)
  return c.json({ status: order.status })
})

// GET /api/public/lan-url — returns the server's LAN base URL so the QR modal
// can generate a URL reachable from phones on the same network. Local mode
// only: in cloud mode the server's own network interfaces are the container's
// private address, not reachable from a customer's device — callers should
// fall back to the request's public origin instead.
publicRouter.get("/lan-url", (c) => {
  const port = new URL(c.req.url).port || "3000"
  if (config.isCloud) return c.json({ urls: [], port })

  const nets = networkInterfaces()
  const lanIps: string[] = []

  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        lanIps.push(`http://${iface.address}:${port}`)
      }
    }
  }

  return c.json({ urls: lanIps, port })
})
