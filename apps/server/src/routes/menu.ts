import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import {
  createMenuItemSchema, updateMenuItemSchema, updateItemAvailabilitySchema,
  createCategorySchema, updateCategorySchema,
  createVariantSchema, updateVariantSchema,
  createModifierGroupSchema, updateModifierGroupSchema,
  createModifierSchema, updateModifierSchema,
  createMenuScheduleSchema, updateMenuScheduleSchema,
  taxConfigSchema,
} from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { categories, menuItems, itemVariants, modifierGroups, modifiers, menuItemModifierGroups, taxConfigs, menuSchedules } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"
import { logAudit } from "../services/audit.js"
import { isScheduleActiveNow } from "../lib/schedule.js"

export const menuRouter = new Hono<AppEnv>()

menuRouter.use("*", requireAuth)

// ── Outlet-ownership guards (variants/modifiers have no outletId of their own) ──
async function itemInOutlet(itemId: string, outletId: string) {
  return db.query.menuItems.findFirst({ where: and(eq(menuItems.id, itemId), eq(menuItems.outletId, outletId)), columns: { id: true } })
}
async function variantInOutlet(variantId: string, outletId: string) {
  const v = await db.query.itemVariants.findFirst({ where: eq(itemVariants.id, variantId), columns: { itemId: true } })
  if (!v) return false
  return !!(await itemInOutlet(v.itemId, outletId))
}
async function groupInOutlet(groupId: string, outletId: string) {
  return db.query.modifierGroups.findFirst({ where: and(eq(modifierGroups.id, groupId), eq(modifierGroups.outletId, outletId)), columns: { id: true } })
}
async function modifierInOutlet(modifierId: string, outletId: string) {
  const m = await db.query.modifiers.findFirst({ where: eq(modifiers.id, modifierId), columns: { groupId: true } })
  if (!m) return false
  return !!(await groupInOutlet(m.groupId, outletId))
}

// ── Full menu read ──────────────────────────────────────────────────────────
menuRouter.get("/", async (c) => {
  const { outletId } = c.get("user")

  const [cats, items, groups, taxList, scheduleList] = await Promise.all([
    db.query.categories.findMany({ where: eq(categories.outletId, outletId) }),
    db.query.menuItems.findMany({ where: eq(menuItems.outletId, outletId) }),
    db.query.modifierGroups.findMany({ where: eq(modifierGroups.outletId, outletId) }),
    db.query.taxConfigs.findMany({ where: eq(taxConfigs.outletId, outletId) }),
    db.query.menuSchedules.findMany({ where: eq(menuSchedules.outletId, outletId) }),
  ])

  // Variants, modifiers and item↔group links have no outletId of their own — scope them
  // to this outlet's items / groups so one outlet never sees another's menu data.
  const itemIds = items.map((i) => i.id)
  const groupIds = groups.map((g) => g.id)
  const [variants, mods, itemGroupLinks] = await Promise.all([
    itemIds.length ? db.query.itemVariants.findMany({ where: (v, { inArray }) => inArray(v.itemId, itemIds) }) : Promise.resolve([]),
    groupIds.length ? db.query.modifiers.findMany({ where: (m, { inArray }) => inArray(m.groupId, groupIds) }) : Promise.resolve([]),
    itemIds.length ? db.query.menuItemModifierGroups.findMany({ where: (l, { inArray }) => inArray(l.itemId, itemIds) }) : Promise.resolve([]),
  ])

  // activeNow lets clients grey out out-of-window items without re-implementing
  // the timezone logic; the server re-checks on add-item regardless.
  const schedules = scheduleList.map((s) => ({ ...s, activeNow: isScheduleActiveNow(s) }))

  return c.json({ categories: cats, items, variants, modifierGroups: groups, modifiers: mods, itemModifierGroups: itemGroupLinks, taxConfigs: taxList, schedules })
})

// ── Menu schedules (time windows / happy hours) ──────────────────────────────
menuRouter.post("/schedules", requireRole("manager", "owner"), zValidator("json", createMenuScheduleSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [schedule] = await db.insert(menuSchedules)
    .values({ ...data, percentOff: String(data.percentOff), outletId })
    .returning()
  return c.json(schedule, 201)
})

menuRouter.patch("/schedules/:id", requireRole("manager", "owner"), zValidator("json", updateMenuScheduleSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.percentOff !== undefined) updates.percentOff = String(data.percentOff)
  const [schedule] = await db.update(menuSchedules).set(updates)
    .where(and(eq(menuSchedules.id, c.req.param("id")), eq(menuSchedules.outletId, outletId)))
    .returning()
  if (!schedule) return c.json({ error: "Not found" }, 404)
  return c.json(schedule)
})

menuRouter.delete("/schedules/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const scheduleId = c.req.param("id")
  const schedule = await db.query.menuSchedules.findFirst({
    where: and(eq(menuSchedules.id, scheduleId), eq(menuSchedules.outletId, outletId)),
  })
  if (!schedule) return c.json({ error: "Not found" }, 404)
  // Detach items/categories first so the FK doesn't block deletion
  await db.update(menuItems).set({ scheduleId: null }).where(and(eq(menuItems.scheduleId, scheduleId), eq(menuItems.outletId, outletId)))
  await db.update(categories).set({ scheduleId: null }).where(and(eq(categories.scheduleId, scheduleId), eq(categories.outletId, outletId)))
  await db.delete(menuSchedules).where(eq(menuSchedules.id, scheduleId))
  return c.body(null, 204)
})

// ── Categories ──────────────────────────────────────────────────────────────
menuRouter.post("/categories", requireRole("manager", "owner"), zValidator("json", createCategorySchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [cat] = await db.insert(categories).values({ ...data, outletId }).returning()
  return c.json(cat, 201)
})

menuRouter.patch("/categories/:id", requireRole("manager", "owner"), zValidator("json", updateCategorySchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [cat] = await db.update(categories).set(data)
    .where(and(eq(categories.id, c.req.param("id")), eq(categories.outletId, outletId)))
    .returning()
  if (!cat) return c.json({ error: "Not found" }, 404)
  return c.json(cat)
})

menuRouter.delete("/categories/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  await db.update(categories).set({ isActive: false })
    .where(and(eq(categories.id, c.req.param("id")), eq(categories.outletId, outletId)))
  return c.body(null, 204)
})

// ── Items ───────────────────────────────────────────────────────────────────
menuRouter.post("/items", requireRole("manager", "owner"), zValidator("json", createMenuItemSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [item] = await db.insert(menuItems)
    .values({ ...data, outletId, basePrice: String(data.basePrice) })
    .returning()
  return c.json(item, 201)
})

menuRouter.patch("/items/:id", requireRole("manager", "owner"), zValidator("json", updateMenuItemSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.basePrice !== undefined) updates.basePrice = String(data.basePrice)

  // Price changes are fraud-sensitive — capture the old price for the audit log
  const before = data.basePrice !== undefined
    ? await db.query.menuItems.findFirst({
        where: and(eq(menuItems.id, c.req.param("id")), eq(menuItems.outletId, outletId)),
        columns: { basePrice: true, name: true },
      })
    : null

  const [item] = await db.update(menuItems).set(updates)
    .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.outletId, outletId)))
    .returning()
  if (!item) return c.json({ error: "Not found" }, 404)

  if (before && Number(before.basePrice) !== Number(item.basePrice)) {
    logAudit({
      outletId, userId, action: "menu.price_change", entity: "menu_item", entityId: item.id,
      details: { name: item.name, from: Number(before.basePrice), to: Number(item.basePrice) },
    })
  }

  broadcastOutlet(outletId, { type: "item.availability", payload: { itemId: item.id, isAvailable: item.isAvailable } })
  return c.json(item)
})

menuRouter.patch("/items/:id/availability", requireRole("manager", "owner", "cashier"), zValidator("json", updateItemAvailabilitySchema), async (c) => {
  const { outletId } = c.get("user")
  const { isAvailable } = c.req.valid("json")
  const [item] = await db.update(menuItems).set({ isAvailable })
    .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.outletId, outletId)))
    .returning()
  if (!item) return c.json({ error: "Not found" }, 404)
  broadcastOutlet(outletId, { type: "item.availability", payload: { itemId: item.id, isAvailable } })
  return c.json(item)
})

menuRouter.delete("/items/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  await db.update(menuItems).set({ isAvailable: false })
    .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.outletId, outletId)))
  return c.body(null, 204)
})

// ── Variants ────────────────────────────────────────────────────────────────
menuRouter.post("/items/:id/variants", requireRole("manager", "owner"), zValidator("json", createVariantSchema), async (c) => {
  const { outletId } = c.get("user")
  const itemId = c.req.param("id")
  if (!(await itemInOutlet(itemId, outletId))) return c.json({ error: "Item not found" }, 404)
  const data = c.req.valid("json")
  const [variant] = await db.insert(itemVariants)
    .values({ itemId, name: data.name, price: String(data.price) })
    .returning()
  return c.json(variant, 201)
})

menuRouter.patch("/variants/:id", requireRole("manager", "owner"), zValidator("json", updateVariantSchema), async (c) => {
  const { outletId } = c.get("user")
  if (!(await variantInOutlet(c.req.param("id"), outletId))) return c.json({ error: "Not found" }, 404)
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.price !== undefined) updates.price = String(data.price)
  const [variant] = await db.update(itemVariants).set(updates)
    .where(eq(itemVariants.id, c.req.param("id")))
    .returning()
  if (!variant) return c.json({ error: "Not found" }, 404)
  return c.json(variant)
})

menuRouter.delete("/variants/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  if (!(await variantInOutlet(c.req.param("id"), outletId))) return c.json({ error: "Not found" }, 404)
  await db.update(itemVariants).set({ isActive: false }).where(eq(itemVariants.id, c.req.param("id")))
  return c.body(null, 204)
})

// ── Modifier groups & modifiers ─────────────────────────────────────────────
menuRouter.post("/modifier-groups", requireRole("manager", "owner"), zValidator("json", createModifierGroupSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [group] = await db.insert(modifierGroups).values({ ...data, outletId }).returning()
  return c.json(group, 201)
})

menuRouter.patch("/modifier-groups/:id", requireRole("manager", "owner"), zValidator("json", updateModifierGroupSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [group] = await db.update(modifierGroups).set(data)
    .where(and(eq(modifierGroups.id, c.req.param("id")), eq(modifierGroups.outletId, outletId)))
    .returning()
  if (!group) return c.json({ error: "Not found" }, 404)
  return c.json(group)
})

menuRouter.delete("/modifier-groups/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const groupId = c.req.param("id")
  await db.transaction(async (tx) => {
    await tx.delete(modifiers).where(eq(modifiers.groupId, groupId))
    await tx.delete(modifierGroups)
      .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.outletId, outletId)))
  })
  return c.body(null, 204)
})

menuRouter.post("/modifier-groups/:id/modifiers", requireRole("manager", "owner"), zValidator("json", createModifierSchema), async (c) => {
  const { outletId } = c.get("user")
  const groupId = c.req.param("id")
  if (!(await groupInOutlet(groupId, outletId))) return c.json({ error: "Modifier group not found" }, 404)
  const data = c.req.valid("json")
  const [mod] = await db.insert(modifiers)
    .values({ groupId, name: data.name, price: String(data.price) })
    .returning()
  return c.json(mod, 201)
})

menuRouter.patch("/modifiers/:id", requireRole("manager", "owner"), zValidator("json", updateModifierSchema), async (c) => {
  const { outletId } = c.get("user")
  if (!(await modifierInOutlet(c.req.param("id"), outletId))) return c.json({ error: "Not found" }, 404)
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.price !== undefined) updates.price = String(data.price)
  const [mod] = await db.update(modifiers).set(updates).where(eq(modifiers.id, c.req.param("id"))).returning()
  if (!mod) return c.json({ error: "Not found" }, 404)
  return c.json(mod)
})

menuRouter.delete("/modifiers/:id", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  if (!(await modifierInOutlet(c.req.param("id"), outletId))) return c.json({ error: "Not found" }, 404)
  await db.update(modifiers).set({ isActive: false }).where(eq(modifiers.id, c.req.param("id")))
  return c.body(null, 204)
})

// ── Item ↔ Modifier group links ─────────────────────────────────────────────
menuRouter.post("/items/:id/modifier-groups", requireRole("manager", "owner"), zValidator("json", z.object({ groupId: z.string().uuid() })), async (c) => {
  const { outletId } = c.get("user")
  const { groupId } = c.req.valid("json")
  const itemId = c.req.param("id")
  if (!(await itemInOutlet(itemId, outletId))) return c.json({ error: "Item not found" }, 404)
  if (!(await groupInOutlet(groupId, outletId))) return c.json({ error: "Modifier group not found" }, 404)
  const existing = await db.query.menuItemModifierGroups.findFirst({
    where: and(eq(menuItemModifierGroups.itemId, itemId), eq(menuItemModifierGroups.groupId, groupId)),
  })
  if (existing) return c.json({ error: "Already linked" }, 400)
  await db.insert(menuItemModifierGroups).values({ itemId, groupId })
  return c.body(null, 204)
})

menuRouter.delete("/items/:id/modifier-groups/:groupId", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  if (!(await itemInOutlet(c.req.param("id"), outletId))) return c.json({ error: "Item not found" }, 404)
  await db.delete(menuItemModifierGroups).where(
    and(eq(menuItemModifierGroups.itemId, c.req.param("id")), eq(menuItemModifierGroups.groupId, c.req.param("groupId"))),
  )
  return c.body(null, 204)
})

// ── Tax configs ─────────────────────────────────────────────────────────────
menuRouter.get("/tax", async (c) => {
  const { outletId } = c.get("user")
  const config = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })
  return c.json(config ?? null)
})

menuRouter.put("/tax", requireRole("owner"), zValidator("json", taxConfigSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const existing = await db.query.taxConfigs.findFirst({ where: eq(taxConfigs.outletId, outletId) })

  const values = {
    name: data.name,
    cgstRate: String(data.cgstRate),
    sgstRate: String(data.sgstRate),
    igstRate: String(data.igstRate),
  }

  if (existing) {
    const [updated] = await db.update(taxConfigs).set(values).where(eq(taxConfigs.id, existing.id)).returning()
    return c.json(updated)
  }
  const [created] = await db.insert(taxConfigs).values({ ...values, outletId }).returning()
  return c.json(created, 201)
})
