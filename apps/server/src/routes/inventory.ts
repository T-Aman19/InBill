import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, desc, gte, lte } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { ingredients, recipes, recipeIngredients, stockMovements } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { broadcastOutlet } from "../services/ws.js"

export const inventoryRouter = new Hono<AppEnv>()

inventoryRouter.use("*", requireAuth)

// ── Ingredients ──────────────────────────────────────────────────────────────

const ingredientSchema = z.object({
  name: z.string().min(1),
  unit: z.enum(["kg", "g", "L", "mL", "pcs"]),
  reorderLevel: z.number().nonnegative().default(0),
  costPerUnit: z.number().nonnegative().default(0),
})

inventoryRouter.get("/ingredients", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.ingredients.findMany({
    where: eq(ingredients.outletId, outletId),
    orderBy: ingredients.name,
  })
  return c.json(rows)
})

inventoryRouter.post(
  "/ingredients",
  requireRole("owner", "manager"),
  zValidator("json", ingredientSchema),
  async (c) => {
    const { outletId } = c.get("user")
    const body = c.req.valid("json")
    const [row] = await db
      .insert(ingredients)
      .values({
        outletId,
        name: body.name,
        unit: body.unit,
        reorderLevel: String(body.reorderLevel),
        costPerUnit: String(body.costPerUnit),
      })
      .returning()
    return c.json(row, 201)
  },
)

inventoryRouter.patch(
  "/ingredients/:id",
  requireRole("owner", "manager"),
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
      unit: z.enum(["kg", "g", "L", "mL", "pcs"]).optional(),
      reorderLevel: z.number().nonnegative().optional(),
      costPerUnit: z.number().nonnegative().optional(),
      isActive: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { outletId } = c.get("user")
    const id = c.req.param("id")
    const body = c.req.valid("json")

    const existing = await db.query.ingredients.findFirst({
      where: and(eq(ingredients.id, id), eq(ingredients.outletId, outletId)),
    })
    if (!existing) return c.json({ error: "Not found" }, 404)

    const update: Record<string, unknown> = {}
    if (body.name !== undefined) update.name = body.name
    if (body.unit !== undefined) update.unit = body.unit
    if (body.reorderLevel !== undefined) update.reorderLevel = String(body.reorderLevel)
    if (body.costPerUnit !== undefined) update.costPerUnit = String(body.costPerUnit)
    if (body.isActive !== undefined) update.isActive = String(body.isActive)

    const [row] = await db.update(ingredients).set(update).where(eq(ingredients.id, id)).returning()
    return c.json(row)
  },
)

inventoryRouter.delete("/ingredients/:id", requireRole("owner", "manager"), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const existing = await db.query.ingredients.findFirst({
    where: and(eq(ingredients.id, id), eq(ingredients.outletId, outletId)),
  })
  if (!existing) return c.json({ error: "Not found" }, 404)

  // Soft-delete: mark inactive
  await db.update(ingredients).set({ isActive: "false" }).where(eq(ingredients.id, id))
  return c.json({ ok: true })
})

// ── Recipes ──────────────────────────────────────────────────────────────────

inventoryRouter.get("/recipes", async (c) => {
  const rows = await db.query.recipes.findMany({
    with: {
      menuItem: { columns: { id: true, name: true, categoryId: true } },
      recipeIngredients: { with: { ingredient: true } },
    },
  })
  return c.json(rows)
})

inventoryRouter.post(
  "/recipes",
  requireRole("owner", "manager"),
  zValidator("json", z.object({ menuItemId: z.string().uuid(), note: z.string().optional() })),
  async (c) => {
    const body = c.req.valid("json")

    const existing = await db.query.recipes.findFirst({
      where: eq(recipes.menuItemId, body.menuItemId),
    })
    if (existing) return c.json({ error: "Recipe already exists for this item" }, 409)

    const [row] = await db.insert(recipes).values({ menuItemId: body.menuItemId, note: body.note }).returning()
    return c.json(row, 201)
  },
)

inventoryRouter.patch(
  "/recipes/:id",
  requireRole("owner", "manager"),
  zValidator("json", z.object({ note: z.string().nullable().optional() })),
  async (c) => {
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const [row] = await db.update(recipes).set({ note: body.note ?? null }).where(eq(recipes.id, id)).returning()
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  },
)

inventoryRouter.delete("/recipes/:id", requireRole("owner", "manager"), async (c) => {
  const id = c.req.param("id")
  await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id))
  const result = await db.delete(recipes).where(eq(recipes.id, id)).returning()
  if (result.length === 0) return c.json({ error: "Not found" }, 404)
  return c.json({ ok: true })
})

// ── Recipe Ingredients ────────────────────────────────────────────────────────

inventoryRouter.post(
  "/recipes/:id/ingredients",
  requireRole("owner", "manager"),
  zValidator(
    "json",
    z.object({
      ingredientId: z.string().uuid(),
      quantity: z.number().positive(),
    }),
  ),
  async (c) => {
    const recipeId = c.req.param("id")
    const body = c.req.valid("json")

    const recipe = await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) })
    if (!recipe) return c.json({ error: "Recipe not found" }, 404)

    const [row] = await db
      .insert(recipeIngredients)
      .values({ recipeId, ingredientId: body.ingredientId, quantity: String(body.quantity) })
      .returning()
    return c.json(row, 201)
  },
)

inventoryRouter.patch(
  "/recipes/:id/ingredients/:riId",
  requireRole("owner", "manager"),
  zValidator("json", z.object({ quantity: z.number().positive() })),
  async (c) => {
    const riId = c.req.param("riId")
    const body = c.req.valid("json")
    const [row] = await db
      .update(recipeIngredients)
      .set({ quantity: String(body.quantity) })
      .where(eq(recipeIngredients.id, riId))
      .returning()
    if (!row) return c.json({ error: "Not found" }, 404)
    return c.json(row)
  },
)

inventoryRouter.delete("/recipes/:id/ingredients/:riId", requireRole("owner", "manager"), async (c) => {
  const riId = c.req.param("riId")
  const result = await db.delete(recipeIngredients).where(eq(recipeIngredients.id, riId)).returning()
  if (result.length === 0) return c.json({ error: "Not found" }, 404)
  return c.json({ ok: true })
})

// ── Stock Movements ───────────────────────────────────────────────────────────

inventoryRouter.get("/movements", async (c) => {
  const { outletId } = c.get("user")
  const limitStr = c.req.query("limit") ?? "50"
  const limit = Math.min(200, Math.max(1, parseInt(limitStr, 10) || 50))
  const rows = await db.query.stockMovements.findMany({
    where: eq(stockMovements.outletId, outletId),
    with: { ingredient: { columns: { id: true, name: true, unit: true } }, recordedBy: { columns: { id: true, name: true } } },
    orderBy: desc(stockMovements.createdAt),
    limit,
  })
  return c.json(rows)
})

// Manual stock adjustment (purchase / waste / adjustment)
inventoryRouter.post(
  "/adjustments",
  requireRole("owner", "manager"),
  zValidator(
    "json",
    z.object({
      ingredientId: z.string().uuid(),
      type: z.enum(["purchase", "waste", "adjustment"]),
      delta: z.number(),
      note: z.string().optional(),
    }),
  ),
  async (c) => {
    const { outletId, userId } = c.get("user")
    const body = c.req.valid("json")

    const ingredient = await db.query.ingredients.findFirst({
      where: and(eq(ingredients.id, body.ingredientId), eq(ingredients.outletId, outletId)),
    })
    if (!ingredient) return c.json({ error: "Ingredient not found" }, 404)

    const [movement] = await db
      .insert(stockMovements)
      .values({
        outletId,
        ingredientId: body.ingredientId,
        type: body.type,
        delta: String(body.delta),
        note: body.note,
        recordedById: userId,
      })
      .returning()

    const newStock = Number(ingredient.currentStock) + body.delta
    const [updated] = await db
      .update(ingredients)
      .set({ currentStock: String(newStock.toFixed(4)) })
      .where(eq(ingredients.id, body.ingredientId))
      .returning()

    if (updated && Number(updated.currentStock) <= Number(updated.reorderLevel) && Number(updated.reorderLevel) > 0) {
      broadcastOutlet(outletId, {
        type: "inventory.low_stock",
        payload: { ingredientId: updated.id, name: updated.name, currentStock: updated.currentStock, unit: updated.unit, reorderLevel: updated.reorderLevel },
      })
    }

    return c.json(movement, 201)
  },
)

// ── Valuation ────────────────────────────────────────────────────────────────

inventoryRouter.get("/valuation", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.ingredients.findMany({
    where: and(eq(ingredients.outletId, outletId)),
  })

  const active = rows.filter((r) => r.isActive === "true")
  let totalValue = 0
  let lowStockCount = 0

  const items = active.map((r) => {
    const value = Number(r.currentStock) * Number(r.costPerUnit)
    totalValue += value
    const isLow = Number(r.reorderLevel) > 0 && Number(r.currentStock) <= Number(r.reorderLevel)
    if (isLow) lowStockCount++
    return { ...r, value: value.toFixed(2), isLow }
  })

  return c.json({ totalValue: totalValue.toFixed(2), lowStockCount, items })
})

// ── Movements CSV export ──────────────────────────────────────────────────────

inventoryRouter.get("/movements/export", async (c) => {
  const { outletId } = c.get("user")
  const from = c.req.query("from")
  const to = c.req.query("to")

  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(to + "T23:59:59Z") : undefined

  const rows = await db.query.stockMovements.findMany({
    where: and(
      eq(stockMovements.outletId, outletId),
      fromDate ? gte(stockMovements.createdAt, fromDate) : undefined,
      toDate ? lte(stockMovements.createdAt, toDate) : undefined,
    ),
    with: {
      ingredient: { columns: { name: true, unit: true, costPerUnit: true } },
      recordedBy: { columns: { name: true } },
    },
    orderBy: desc(stockMovements.createdAt),
  })

  const csvRows = ["Date,Ingredient,Unit,Type,Delta,Cost/Unit,Value,Note,Recorded By"]
  for (const m of rows) {
    const delta = Number(m.delta)
    const cost = Math.abs(delta) * Number(m.ingredient?.costPerUnit ?? 0)
    csvRows.push([
      new Date(m.createdAt).toISOString().slice(0, 19).replace("T", " "),
      `"${(m.ingredient?.name ?? "").replace(/"/g, '""')}"`,
      m.ingredient?.unit ?? "",
      m.type,
      delta.toFixed(4),
      Number(m.ingredient?.costPerUnit ?? 0).toFixed(2),
      cost.toFixed(2),
      `"${(m.note ?? "").replace(/"/g, '""')}"`,
      `"${(m.recordedBy?.name ?? "system").replace(/"/g, '""')}"`,
    ].join(","))
  }

  const filename = from && to ? `movements-${from}-to-${to}.csv` : "movements.csv"
  return new Response(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})

// ── Low-stock summary (for badge polling) ────────────────────────────────────

inventoryRouter.get("/low-stock-count", async (c) => {
  const { outletId } = c.get("user")
  const rows = await db.query.ingredients.findMany({
    where: and(eq(ingredients.outletId, outletId)),
    columns: { currentStock: true, reorderLevel: true, isActive: true },
  })
  const count = rows.filter(
    (r) => r.isActive === "true" && Number(r.reorderLevel) > 0 && Number(r.currentStock) <= Number(r.reorderLevel),
  ).length
  return c.json({ count })
})
