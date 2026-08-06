import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq, and, gt, isNull } from "drizzle-orm"
import { loginSchema, ownerLoginSchema, ownerRegisterSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema, verifyEmailSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { users, owners, outlets, ownerPasswordResets, ownerEmailVerifications } from "../db/schema/index.js"
import { signToken, requireAuth } from "../middleware/auth.js"
import { config } from "../config.js"
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js"
import { verifyPin, hashPin, isHashed } from "../lib/pin.js"

export const authRouter = new Hono<AppEnv>()

// Staff PIN login (local + cloud)
authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const { pin, outletId } = c.req.valid("json")

  // PINs are hashed at rest, so we can't look up by equality — verify against
  // each active staff member (legacy plaintext PINs are accepted and upgraded).
  const candidates = await db.query.users.findMany({
    where: and(eq(users.outletId, outletId), eq(users.isActive, true)),
  })
  let user = null
  for (const u of candidates) {
    if (await verifyPin(pin, u.pin)) { user = u; break }
  }

  if (!user) return c.json({ error: "Invalid PIN" }, 401)

  // Opportunistically upgrade a legacy plaintext PIN to a hash
  if (user.pin && !isHashed(user.pin)) {
    await db.update(users).set({ pin: await hashPin(pin) }).where(eq(users.id, user.id))
  }

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

  // Local/self-hosted owners are trusted by default (same reasoning as the
  // entitlements local=unlimited short-circuit) — only cloud accounts need to
  // prove they own the address before they can add an outlet.
  if (config.isCloud) {
    const rawToken = await createVerificationToken(owner.id)
    try {
      await sendVerificationEmail(email, rawToken)
    } catch (e) {
      console.error("[auth] verification email failed:", e)
    }
  }

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

// Generate a reset token, store only its SHA-256 hash (1-hour expiry), return the raw token.
async function createResetToken(ownerId: string): Promise<string> {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32))
  const rawToken = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken))
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")
  await db.insert(ownerPasswordResets).values({ ownerId, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) })
  return rawToken
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

  const rawToken = await createResetToken(owner.id)

  // A send failure (e.g. missing/invalid RESEND_API_KEY) must not turn into a
  // 500 — that both breaks the flow and leaks which emails have accounts.
  try {
    await sendPasswordResetEmail(email, rawToken)
  } catch (e) {
    console.error("[auth] password reset email failed:", e)
  }
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

// ── Email verification (cloud only) ────────────────────────────────────────────
// Owners must verify before they can add an outlet — enforced in owner.ts's
// POST /outlets, not here. This section only issues/consumes the token.

async function hashToken(rawToken: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Store only the SHA-256 hash (24-hour expiry), return the raw token to email out.
async function createVerificationToken(ownerId: string): Promise<string> {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32))
  const rawToken = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
  const tokenHash = await hashToken(rawToken)
  await db.insert(ownerEmailVerifications).values({ ownerId, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) })
  return rawToken
}

// Separate bucket from the password-reset limiter — a burst of one shouldn't
// throttle the other since they're different intents.
const verifyRateLimit = new Map<string, { count: number; resetAt: number }>()
function checkVerifyResendLimit(email: string): boolean {
  const now = Date.now()
  const entry = verifyRateLimit.get(email)
  if (!entry || entry.resetAt < now) {
    verifyRateLimit.set(email, { count: 1, resetAt: now + 15 * 60_000 })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

authRouter.post("/owner/verify-email", zValidator("json", verifyEmailSchema), async (c) => {
  const { token } = c.req.valid("json")
  const tokenHash = await hashToken(token)

  const verification = await db.query.ownerEmailVerifications.findFirst({
    where: and(
      eq(ownerEmailVerifications.tokenHash, tokenHash),
      isNull(ownerEmailVerifications.usedAt),
      gt(ownerEmailVerifications.expiresAt, new Date()),
    ),
  })
  if (!verification) return c.json({ error: "Invalid or expired verification link" }, 400)

  await Promise.all([
    db.update(owners).set({ emailVerified: true }).where(eq(owners.id, verification.ownerId)),
    db.update(ownerEmailVerifications).set({ usedAt: new Date() }).where(eq(ownerEmailVerifications.id, verification.id)),
  ])

  return c.json({ ok: true })
})

// Re-send the verification link to the signed-in owner (cloud only).
authRouter.post("/owner/resend-verification", requireAuth, async (c) => {
  const user = c.get("user")
  if (user.role !== "owner") return c.json({ error: "Forbidden" }, 403)
  if (!config.isCloud) return c.json({ error: "Not available in local mode" }, 400)

  const owner = await db.query.owners.findFirst({ where: eq(owners.id, user.ownerId) })
  if (!owner) return c.json({ error: "Owner not found" }, 404)
  if (owner.emailVerified) return c.json({ ok: true, alreadyVerified: true })
  if (!checkVerifyResendLimit(owner.email)) return c.json({ ok: true }) // rate-limited, same silent-success shape as send-reset

  const rawToken = await createVerificationToken(owner.id)
  try {
    await sendVerificationEmail(owner.email, rawToken)
  } catch (e) {
    console.error("[auth] resend-verification email failed:", e)
    return c.json({ error: "Couldn't send the verification email. Please try again shortly." }, 502)
  }
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

// ── Email a reset link to the signed-in owner (cloud only) ────────────────────
// The Owner Dashboard's "change password" flow in cloud mode: no current-password
// entry — the owner authenticates by clicking the link we email them.
authRouter.post("/owner/send-reset", requireAuth, async (c) => {
  const user = c.get("user")
  if (user.role !== "owner") return c.json({ error: "Forbidden" }, 403)
  if (!config.isCloud) {
    return c.json({ error: "Email reset isn't available in self-hosted mode" }, 400)
  }

  const owner = await db.query.owners.findFirst({ where: eq(owners.id, user.ownerId) })
  if (!owner) return c.json({ error: "Owner not found" }, 404)
  if (!checkForgotLimit(owner.email)) return c.json({ ok: true, email: owner.email }) // rate-limited

  const rawToken = await createResetToken(owner.id)
  try {
    await sendPasswordResetEmail(owner.email, rawToken)
  } catch (e) {
    console.error("[auth] send-reset email failed:", e)
    return c.json({ error: "Couldn't send the reset email. Please try again shortly." }, 502)
  }
  return c.json({ ok: true, email: owner.email })
})
