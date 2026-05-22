import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and } from "drizzle-orm"
import { loginSchema, ownerLoginSchema, ownerRegisterSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { users, owners, outlets } from "../db/schema/index.js"
import { signToken, requireAuth } from "../middleware/auth.js"

export const authRouter = new Hono<AppEnv>()

// Staff PIN login (local + cloud)
authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const { pin, outletId } = c.req.valid("json")

  const user = await db.query.users.findFirst({
    where: and(eq(users.outletId, outletId), eq(users.pin, pin), eq(users.isActive, true)),
  })

  if (!user) return c.json({ error: "Invalid PIN" }, 401)

  const outlet = await db.query.outlets.findFirst({ where: eq(outlets.id, outletId) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)

  const token = await signToken({
    userId: user.id,
    outletId: user.outletId,
    ownerId: outlet.ownerId,
    role: user.role,
  })

  return c.json({ token, user: { id: user.id, name: user.name, role: user.role } })
})

// Resolve outlet setup code → outlet id + name (public, no auth)
authRouter.get("/outlet-setup/:code", async (c) => {
  const code = c.req.param("code").toUpperCase()
  const outlet = await db.query.outlets.findFirst({
    where: and(eq(outlets.setupCode, code), eq(outlets.isActive, true)),
  })
  if (!outlet) return c.json({ error: "Invalid setup code" }, 404)
  return c.json({ id: outlet.id, name: outlet.name })
})

// Owner registration
authRouter.post("/owner/register", zValidator("json", ownerRegisterSchema), async (c) => {
  const { name, email, password, phone } = c.req.valid("json")

  const existing = await db.query.owners.findFirst({ where: eq(owners.email, email) })
  if (existing) return c.json({ error: "Email already registered" }, 409)

  const passwordHash = await Bun.password.hash(password)
  const rows = await db.insert(owners).values({ name, email, passwordHash, phone }).returning()
  const owner = rows[0]
  if (!owner) return c.json({ error: "Failed to create account" }, 500)

  const token = await signToken({ userId: owner.id, outletId: "", ownerId: owner.id, role: "owner" })
  return c.json({ token, owner: { id: owner.id, name: owner.name, email: owner.email } }, 201)
})

// Owner email login (cloud dashboard)
authRouter.post("/owner/login", zValidator("json", ownerLoginSchema), async (c) => {
  const { email, password } = c.req.valid("json")

  const owner = await db.query.owners.findFirst({ where: eq(owners.email, email) })
  if (!owner) return c.json({ error: "Invalid credentials" }, 401)

  const valid = await Bun.password.verify(password, owner.passwordHash)
  if (!valid) return c.json({ error: "Invalid credentials" }, 401)

  const token = await signToken({
    userId: owner.id,
    outletId: "",
    ownerId: owner.id,
    role: "owner",
  })

  return c.json({ token, owner: { id: owner.id, name: owner.name, email: owner.email } })
})

authRouter.get("/me", requireAuth, (c) => c.json(c.get("user")))
