import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { users } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const usersRouter = new Hono<AppEnv>()

usersRouter.use("*", requireAuth)

const createUserSchema = z.object({
  name: z.string().min(1),
  pin: z.string().length(4).regex(/^\d+$/),
  role: z.enum(["manager", "cashier", "captain", "kitchen"]),
})

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().length(4).regex(/^\d+$/).optional(),
  role: z.enum(["manager", "cashier", "captain", "kitchen"]).optional(),
  isActive: z.boolean().optional(),
})

const changeSelfPinSchema = z.object({
  currentPin: z.string().length(4),
  newPin: z.string().length(4).regex(/^\d+$/),
})

// List all staff for this outlet
usersRouter.get("/", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const staff = await db.query.users.findMany({
    where: eq(users.outletId, outletId),
    columns: { pin: false },
  })
  return c.json(staff)
})

// Create new staff member
usersRouter.post("/", requireRole("manager", "owner"), zValidator("json", createUserSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")

  const existing = await db.query.users.findFirst({
    where: and(eq(users.outletId, outletId), eq(users.pin, data.pin)),
  })
  if (existing) return c.json({ error: "PIN already in use by another staff member" }, 409)

  const [user] = await db
    .insert(users)
    .values({ ...data, outletId })
    .returning({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt })

  return c.json(user, 201)
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Update staff member (manager resets PIN, changes role, disables)
usersRouter.patch("/:id", requireRole("manager", "owner"), zValidator("json", updateUserSchema), async (c) => {
  const id = c.req.param("id")
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid staff ID" }, 400)
  const { outletId } = c.get("user")
  const data = c.req.valid("json")

  if (data.pin) {
    const conflict = await db.query.users.findFirst({
      where: and(eq(users.outletId, outletId), eq(users.pin, data.pin)),
    })
    if (conflict && conflict.id !== id) {
      return c.json({ error: "PIN already in use by another staff member" }, 409)
    }
  }

  const [updated] = await db
    .update(users)
    .set(data)
    .where(and(eq(users.id, id), eq(users.outletId, outletId)))
    .returning({ id: users.id, name: users.name, role: users.role, isActive: users.isActive })

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// Staff self-change their own PIN (requires current PIN)
usersRouter.patch("/me/pin", zValidator("json", changeSelfPinSchema), async (c) => {
  const { userId, outletId } = c.get("user")
  const { currentPin, newPin } = c.req.valid("json")

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.outletId, outletId)),
  })
  if (!user || user.pin !== currentPin) return c.json({ error: "Current PIN is incorrect" }, 401)

  const conflict = await db.query.users.findFirst({
    where: and(eq(users.outletId, outletId), eq(users.pin, newPin)),
  })
  if (conflict && conflict.id !== userId) return c.json({ error: "PIN already in use" }, 409)

  await db.update(users).set({ pin: newPin }).where(eq(users.id, userId))
  return c.json({ message: "PIN updated" })
})

// Disable / re-enable staff
usersRouter.delete("/:id", requireRole("manager", "owner"), async (c) => {
  const id = c.req.param("id")
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid staff ID" }, 400)
  const { outletId } = c.get("user")
  const [updated] = await db
    .update(users)
    .set({ isActive: false })
    .where(and(eq(users.id, id), eq(users.outletId, outletId)))
    .returning({ id: users.id })

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})
