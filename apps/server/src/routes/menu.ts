import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import {
  createMenuItemSchema, updateMenuItemSchema, updateItemAvailabilitySchema,
  createCategorySchema, updateCategorySchema,
  createVariantSchema, updateVariantSchema,
  createModifierGroupSchema, updateModifierGroupSchema,
  createModifierSchema, updateModifierSchema,
  taxConfigSchema,
} from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { categories, menuItems, itemVariants, modifierGroups, modifiers, menuItemModifierGroups, taxConfigs } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"

export const menuRouter = new Hono<AppEnv>()

menuRouter.use("*", requireAuth)

// ── Full menu read ──────────────────────────────────────────────────────────
menuRouter.get("/", async (c) => {
  const { outletId } = c.get("user")

  const [cats, items, variants, groups, mods, itemGroupLinks, taxList] = await Promise.all([
    db.query.categories.findMany({ where: eq(categories.outletId, outletId) }),
    db.query.menuItems.findMany({ where: eq(menuItems.outletId, outletId) }),
    db.query.itemVariants.findMany(),
    db.query.modifierGroups.findMany({ where: eq(modifierGroups.outletId, outletId) }),
    db.query.modifiers.findMany(),
    db.query.menuItemModifierGroups.findMany(),
    db.query.taxConfigs.findMany({ where: eq(taxConfigs.outletId, outletId) }),
  ])

  return c.json({ categories: cats, items, variants, modifierGroups: groups, modifiers: mods, itemModifierGroups: itemGroupLinks, taxConfigs: taxList })
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
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.basePrice !== undefined) updates.basePrice = String(data.basePrice)
  const [item] = await db.update(menuItems).set(updates)
    .where(and(eq(menuItems.id, c.req.param("id")), eq(menuItems.outletId, outletId)))
    .returning()
  if (!item) return c.json({ error: "Not found" }, 404)
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
  const data = c.req.valid("json")
  const [variant] = await db.insert(itemVariants)
    .values({ itemId: c.req.param("id"), name: data.name, price: String(data.price) })
    .returning()
  return c.json(variant, 201)
})

menuRouter.patch("/variants/:id", requireRole("manager", "owner"), zValidator("json", updateVariantSchema), async (c) => {
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
  const data = c.req.valid("json")
  const [mod] = await db.insert(modifiers)
    .values({ groupId: c.req.param("id"), name: data.name, price: String(data.price) })
    .returning()
  return c.json(mod, 201)
})

menuRouter.patch("/modifiers/:id", requireRole("manager", "owner"), zValidator("json", updateModifierSchema), async (c) => {
  const data = c.req.valid("json")
  const updates: Record<string, unknown> = { ...data }
  if (data.price !== undefined) updates.price = String(data.price)
  const [mod] = await db.update(modifiers).set(updates).where(eq(modifiers.id, c.req.param("id"))).returning()
  if (!mod) return c.json({ error: "Not found" }, 404)
  return c.json(mod)
})

menuRouter.delete("/modifiers/:id", requireRole("manager", "owner"), async (c) => {
  await db.update(modifiers).set({ isActive: false }).where(eq(modifiers.id, c.req.param("id")))
  return c.body(null, 204)
})

// ── Item ↔ Modifier group links ─────────────────────────────────────────────
menuRouter.post("/items/:id/modifier-groups", requireRole("manager", "owner"), async (c) => {
  const { groupId } = await c.req.json() as { groupId: string }
  const itemId = c.req.param("id")
  const existing = await db.query.menuItemModifierGroups.findFirst({
    where: and(eq(menuItemModifierGroups.itemId, itemId), eq(menuItemModifierGroups.groupId, groupId)),
  })
  if (existing) return c.json({ error: "Already linked" }, 400)
  await db.insert(menuItemModifierGroups).values({ itemId, groupId })
  return c.body(null, 204)
})

menuRouter.delete("/items/:id/modifier-groups/:groupId", requireRole("manager", "owner"), async (c) => {
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
