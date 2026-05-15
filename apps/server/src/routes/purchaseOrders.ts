import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, desc } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { purchaseOrders, purchaseOrderItems, vendors, ingredients, stockMovements } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const purchaseOrdersRouter = new Hono<AppEnv>()

purchaseOrdersRouter.use("*", requireAuth, requireRole("owner", "manager"))

const lineItemSchema = z.object({
  ingredientId: z.string().uuid(),
  orderedQty: z.number().positive(),
  unitCost: z.number().nonnegative(),
  note: z.string().optional(),
})

const createPOSchema = z.object({
  vendorId: z.string().uuid(),
  notes: z.string().optional(),
  expectedAt: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
})

purchaseOrdersRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const vendorId = c.req.query("vendorId")
  const status = c.req.query("status")

  const rows = await db.query.purchaseOrders.findMany({
    where: and(
      eq(purchaseOrders.outletId, outletId),
      vendorId ? eq(purchaseOrders.vendorId, vendorId) : undefined,
      status ? eq(purchaseOrders.status, status as "draft" | "ordered" | "partial" | "received") : undefined,
    ),
    with: {
      vendor: { columns: { id: true, name: true, phone: true } },
      items: { columns: { id: true } },
      createdBy: { columns: { id: true, name: true } },
    },
    orderBy: desc(purchaseOrders.createdAt),
  })

  return c.json(rows.map((r) => ({ ...r, itemCount: r.items.length, items: undefined })))
})

purchaseOrdersRouter.get("/:id", async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const row = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.outletId, outletId)),
    with: {
      vendor: true,
      createdBy: { columns: { id: true, name: true } },
      items: { with: { ingredient: { columns: { id: true, name: true, unit: true, currentStock: true } } } },
    },
  })
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(row)
})

purchaseOrdersRouter.post("/", zValidator("json", createPOSchema), async (c) => {
  const { outletId, userId } = c.get("user")
  const body = c.req.valid("json")

  const vendor = await db.query.vendors.findFirst({
    where: and(eq(vendors.id, body.vendorId), eq(vendors.outletId, outletId), eq(vendors.isActive, true)),
  })
  if (!vendor) return c.json({ error: "Vendor not found" }, 404)

  const totalAmount = body.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0)

  const [po] = await db.insert(purchaseOrders).values({
    outletId,
    vendorId: body.vendorId,
    notes: body.notes,
    expectedAt: body.expectedAt ? new Date(body.expectedAt) : undefined,
    totalAmount: String(totalAmount.toFixed(2)),
    createdById: userId,
  }).returning()

  await db.insert(purchaseOrderItems).values(
    body.items.map((i) => ({
      purchaseOrderId: po!.id,
      ingredientId: i.ingredientId,
      orderedQty: String(i.orderedQty),
      unitCost: String(i.unitCost),
      note: i.note,
    })),
  )

  const full = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, po!.id),
    with: { vendor: true, items: { with: { ingredient: { columns: { id: true, name: true, unit: true, currentStock: true } } } } },
  })
  return c.json(full, 201)
})

purchaseOrdersRouter.patch("/:id", zValidator("json", z.object({
  notes: z.string().optional(),
  expectedAt: z.string().nullable().optional(),
  items: z.array(lineItemSchema).min(1).optional(),
})), async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")
  const body = c.req.valid("json")

  const po = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.outletId, outletId)),
  })
  if (!po) return c.json({ error: "Not found" }, 404)
  if (po.status !== "draft") return c.json({ error: "Can only edit draft purchase orders" }, 400)

  const updates: Record<string, unknown> = {}
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.expectedAt !== undefined) updates.expectedAt = body.expectedAt ? new Date(body.expectedAt) : null

  if (body.items) {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id))
    await db.insert(purchaseOrderItems).values(
      body.items.map((i) => ({
        purchaseOrderId: id,
        ingredientId: i.ingredientId,
        orderedQty: String(i.orderedQty),
        unitCost: String(i.unitCost),
        note: i.note,
      })),
    )
    updates.totalAmount = String(body.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0).toFixed(2))
  }

  if (Object.keys(updates).length > 0) {
    await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.id, id))
  }

  const full = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    with: { vendor: true, items: { with: { ingredient: { columns: { id: true, name: true, unit: true, currentStock: true } } } } },
  })
  return c.json(full)
})

// Draft → Ordered
purchaseOrdersRouter.post("/:id/order", async (c) => {
  const { outletId } = c.get("user")
  const id = c.req.param("id")

  const po = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.outletId, outletId)),
  })
  if (!po) return c.json({ error: "Not found" }, 404)
  if (po.status !== "draft") return c.json({ error: "Only draft POs can be marked as ordered" }, 400)

  await db.update(purchaseOrders).set({ status: "ordered" }).where(eq(purchaseOrders.id, id))
  return c.json({ ok: true, status: "ordered" })
})

// Ordered → Received: update stock with weighted avg cost
purchaseOrdersRouter.post("/:id/receive", zValidator("json", z.object({
  receivedItems: z.array(z.object({ itemId: z.string().uuid(), receivedQty: z.number().nonnegative() })),
})), async (c) => {
  const { outletId, userId } = c.get("user")
  const id = c.req.param("id")
  const { receivedItems } = c.req.valid("json")

  const po = await db.query.purchaseOrders.findFirst({
    where: and(eq(purchaseOrders.id, id), eq(purchaseOrders.outletId, outletId)),
    with: { items: { with: { ingredient: true } } },
  })
  if (!po) return c.json({ error: "Not found" }, 404)
  if (po.status !== "ordered" && po.status !== "partial") {
    return c.json({ error: "Only ordered or partial POs can be received" }, 400)
  }

  const receivedMap = new Map(receivedItems.map((r) => [r.itemId, r.receivedQty]))

  for (const line of po.items) {
    const received = receivedMap.get(line.id) ?? 0
    if (received <= 0) continue

    const ingredient = line.ingredient
    const oldStock = Number(ingredient.currentStock)
    const oldCost = Number(ingredient.costPerUnit)
    const newStock = oldStock + received
    const unitCost = Number(line.unitCost)

    // Weighted average cost
    const newCost = newStock > 0 ? (oldStock * oldCost + received * unitCost) / newStock : unitCost

    await db.update(ingredients).set({
      currentStock: String(newStock.toFixed(4)),
      costPerUnit: String(newCost.toFixed(2)),
    }).where(eq(ingredients.id, ingredient.id))

    await db.update(purchaseOrderItems).set({
      receivedQty: String((Number(line.receivedQty) + received).toFixed(4)),
    }).where(eq(purchaseOrderItems.id, line.id))

    await db.insert(stockMovements).values({
      outletId,
      ingredientId: ingredient.id,
      type: "purchase",
      delta: String(received.toFixed(4)),
      referenceId: id,
      referenceType: "purchase_order",
      note: `PO received`,
      recordedById: userId,
    })
  }

  // Check if fully received
  const updatedItems = await db.query.purchaseOrderItems.findMany({
    where: eq(purchaseOrderItems.purchaseOrderId, id),
  })
  const allReceived = updatedItems.every((i) => Number(i.receivedQty) >= Number(i.orderedQty))
  const newStatus = allReceived ? "received" : "partial"

  await db.update(purchaseOrders).set({
    status: newStatus,
    receivedAt: allReceived ? new Date() : undefined,
  }).where(eq(purchaseOrders.id, id))

  const full = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    with: { vendor: true, items: { with: { ingredient: { columns: { id: true, name: true, unit: true, currentStock: true } } } } },
  })
  return c.json(full)
})
