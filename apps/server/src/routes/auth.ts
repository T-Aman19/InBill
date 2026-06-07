import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gt, isNull } from "drizzle-orm"
import { loginSchema, ownerLoginSchema, ownerRegisterSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { users, owners, outlets, ownerPasswordResets } from "../db/schema/index.js"
import { signToken, requireAuth } from "../middleware/auth.js"
import { config } from "../config.js"
import { sendPasswordResetEmail } from "../lib/email.js"

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

// ── Password reset (cloud only) ───────────────────────────────────────────────

// Simple in-memory rate limiter: max 3 requests per email per 15 min
const forgotRateLimit = new Map<string, { count: number; resetAt: number }>()
function checkForgotLimit(email: string): boolean {
  const now = Date.now()
  const entry = forgotRateLimit.get(email)
  if (!entry || entry.resetAt < now) {
    forgotRateLimit.set(email, { count: 1, resetAt: now + 15 * 60_000 })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

authRouter.post("/owner/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
  if (!config.isCloud) {
    return c.json({ error: "Password reset via email is not available in local mode. Run: bun run src/scripts/reset-owner-password.ts" }, 400)
  }

  const { email } = c.req.valid("json")

  // Always respond 200 to prevent user enumeration
  if (!checkForgotLimit(email)) return c.json({ ok: true })

  const owner = await db.query.owners.findFirst({ where: eq(owners.email, email) })
  if (!owner) return c.json({ ok: true })

  // Generate a 32-byte random token; store only its SHA-256 hash
  const rawBytes = crypto.getRandomValues(new Uint8Array(32))
  const rawToken = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")

  const expiresAt = new Date(Date.now() + 60 * 60_000) // 1 hour
  await db.insert(ownerPasswordResets).values({ ownerId: owner.id, tokenHash, expiresAt })

  await sendPasswordResetEmail(email, rawToken)
  return c.json({ ok: true })
})

authRouter.post("/owner/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
  if (!config.isCloud) {
    return c.json({ error: "Not available in local mode" }, 400)
  }

  const { token, newPassword } = c.req.valid("json")

  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")

  const reset = await db.query.ownerPasswordResets.findFirst({
    where: and(
      eq(ownerPasswordResets.tokenHash, tokenHash),
      isNull(ownerPasswordResets.usedAt),
      gt(ownerPasswordResets.expiresAt, new Date()),
    ),
  })

  if (!reset) return c.json({ error: "Invalid or expired reset link" }, 400)

  const passwordHash = await Bun.password.hash(newPassword)
  await Promise.all([
    db.update(owners).set({ passwordHash }).where(eq(owners.id, reset.ownerId)),
    db.update(ownerPasswordResets).set({ usedAt: new Date() }).where(eq(ownerPasswordResets.id, reset.id)),
  ])

  return c.json({ ok: true })
})

// ── Change password (authenticated, both modes) ───────────────────────────────

authRouter.patch("/owner/change-password", requireAuth, zValidator("json", changePasswordSchema), async (c) => {
  const { ownerId } = c.get("user")
  const { currentPassword, newPassword } = c.req.valid("json")

  const owner = await db.query.owners.findFirst({ where: eq(owners.id, ownerId) })
  if (!owner) return c.json({ error: "Owner not found" }, 404)

  const valid = await Bun.password.verify(currentPassword, owner.passwordHash)
  if (!valid) return c.json({ error: "Current password is incorrect" }, 400)

  const passwordHash = await Bun.password.hash(newPassword)
  await db.update(owners).set({ passwordHash }).where(eq(owners.id, ownerId))

  return c.json({ ok: true })
})
