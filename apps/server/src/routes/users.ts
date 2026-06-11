import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, ne } from "drizzle-orm"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { users } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const usersRouter = new Hono<AppEnv>()

usersRouter.use("*", requireAuth)

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212", "0101", "1122"])

const pinSchema = z
  .string()
  .length(4)
  .regex(/^\d+$/, "PIN must be 4 digits")
  .refine((p) => !WEAK_PINS.has(p), { message: "PIN is too easy to guess — choose a less predictable one" })

const createUserSchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()),
  pin: pinSchema,
  role: z.enum(["manager", "cashier", "captain", "kitchen", "host"]),
})

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
  pin: pinSchema.optional(),
  role: z.enum(["manager", "cashier", "captain", "kitchen", "host"]).optional(),
  isActive: z.boolean().optional(),
})

const changeSelfPinSchema = z.object({
  currentPin: z.string().length(4),
  newPin: pinSchema,
})

// List all staff for this outlet
usersRouter.get("/", requireRole("manager", "owner"), async (c) => {
  const { outletId } = c.get("user")
  const staff = await db.query.users.findMany({
    where: and(eq(users.outletId, outletId), ne(users.role, "owner")),
    columns: { pin: false },
  })
  return c.json(staff)
})

// Create new staff member
usersRouter.post("/", requireRole("manager", "owner"), zValidator("json", createUserSchema), async (c) => {
  const { outletId, role: callerRole } = c.get("user")
  const data = c.req.valid("json")

  if (data.role === "manager" && callerRole !== "owner") {
    return c.json({ error: "Only the owner can create manager accounts" }, 403)
  }

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
  const { outletId, role: callerRole } = c.get("user")
  const data = c.req.valid("json")

  if (data.role === "manager" && callerRole !== "owner") {
    return c.json({ error: "Only the owner can assign the manager role" }, 403)
  }

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
