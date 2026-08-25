// OAuth 2.1 remote-connector auth — cloud mode only (mirrors the config.isCloud
// gating already used for email/reset flows in routes/auth.ts). Local/desktop
// mode has no public HTTPS origin or hosted login page to run a consent screen
// against, so it relies solely on the static API-key path (lib/mcpApiKeys.ts).
//
// `oauthRouter` mounts @hono/mcp's mcpAuthRouter — a Hono-native implementation
// of RFC 9728 (protected resource metadata), RFC 8414 (AS metadata),
// RFC 7591 (dynamic client registration), plus /authorize and /token — around
// our InbillOAuthProvider. It must be mounted at the application root (see
// index.ts), since the well-known paths are spec-fixed and can't live under
// /api. `oauthApproveRouter` is the one custom piece: the consent page (SPA)
// calls it, authenticated with the owner's normal JWT, to actually mint the
// authorization code after the owner approves.
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { mcpAuthRouter } from "@hono/mcp"
import { eq, and, inArray } from "drizzle-orm"
import type { AppEnv } from "../lib/types.js"
import { config } from "../config.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { oauthProvider, createAuthorizationCode } from "../lib/oauthProvider.js"
import { db } from "../db/index.js"
import { outlets, oauthClients, oauthAccessTokens, oauthRefreshTokens } from "../db/schema/index.js"

const CLOUD_ONLY_MESSAGE = { error: "OAuth is only available in cloud mode; generate a static API key instead (Owner Dashboard → Integrations)." }

export const oauthRouter: Hono = config.isCloud
  ? mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(config.email.appUrl),
      resourceServerUrl: new URL("/mcp", config.email.appUrl),
      resourceName: "InBill",
    })
  : (() => {
      // Exact paths — must mirror what mcpAuthRouter actually mounts in cloud
      // mode (all top-level, no /oauth prefix). A wildcard like "/oauth/*" or
      // "/.well-known/oauth-*" looks plausible but matches nothing in Hono's
      // router (no mid-segment glob support), silently falling through to the
      // SPA catch-all instead of 404ing — caught by live-testing this path.
      const stub = new Hono()
      for (const path of ["/authorize", "/token", "/register", "/revoke", "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource/mcp"]) {
        stub.all(path, (c) => c.json(CLOUD_ONLY_MESSAGE, 404))
      }
      return stub
    })()

const approveSchema = z.object({
  clientId: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string(),
  state: z.string().optional(),
  outletIds: z.array(z.string()).nullable(), // null = every outlet this owner has
})

export const oauthApproveRouter = new Hono<AppEnv>()

oauthApproveRouter.use("*", requireAuth, requireRole("owner"))
oauthApproveRouter.use("*", async (c, next) => {
  if (!config.isCloud) return c.json(CLOUD_ONLY_MESSAGE, 404)
  await next()
})

// Apps this owner has approved via the consent screen — powers the "Connected
// apps" list in Owner Dashboard → Integrations, grouped by OAuth client since
// one client can hold several (rotated) token pairs.
oauthApproveRouter.get("/grants", async (c) => {
  const { ownerId } = c.get("user")
  const [accessRows, refreshRows] = await Promise.all([
    db.query.oauthAccessTokens.findMany({ where: eq(oauthAccessTokens.ownerId, ownerId) }),
    db.query.oauthRefreshTokens.findMany({ where: eq(oauthRefreshTokens.ownerId, ownerId) }),
  ])
  const clientIds = [...new Set([...accessRows.map((r) => r.clientId), ...refreshRows.map((r) => r.clientId)])]
  if (clientIds.length === 0) return c.json([])

  const clients = await db.query.oauthClients.findMany({ where: inArray(oauthClients.id, clientIds) })
  const clientMap = new Map(clients.map((cl) => [cl.id, cl]))

  const grants = clientIds.map((clientId) => {
    const grantedAt = accessRows
      .filter((r) => r.clientId === clientId)
      .reduce<Date | null>((latest, r) => (!latest || r.createdAt > latest ? r.createdAt : latest), null)
    return { clientId, clientName: clientMap.get(clientId)?.clientName ?? "Unknown app", grantedAt }
  })
  return c.json(grants)
})

oauthApproveRouter.delete("/grants/:clientId", async (c) => {
  const { ownerId } = c.get("user")
  const clientId = c.req.param("clientId")
  await Promise.all([
    db.update(oauthAccessTokens).set({ expiresAt: new Date(0) })
      .where(and(eq(oauthAccessTokens.ownerId, ownerId), eq(oauthAccessTokens.clientId, clientId))),
    db.update(oauthRefreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.ownerId, ownerId), eq(oauthRefreshTokens.clientId, clientId))),
  ])
  return c.body(null, 204)
})

oauthApproveRouter.post("/authorize/approve", zValidator("json", approveSchema), async (c) => {
  const { ownerId } = c.get("user")
  const { clientId, redirectUri, codeChallenge, state, outletIds } = c.req.valid("json")

  if (outletIds) {
    const owned = await db.query.outlets.findMany({ where: and(inArray(outlets.id, outletIds), eq(outlets.ownerId, ownerId)) })
    if (owned.length !== outletIds.length) return c.json({ error: "One or more selected outlets do not belong to this account" }, 403)
  }

  const code = await createAuthorizationCode({ ownerId, clientId, redirectUri, codeChallenge, outletIds })

  const redirect = new URL(redirectUri)
  redirect.searchParams.set("code", code)
  if (state) redirect.searchParams.set("state", state)
  return c.json({ redirectUrl: redirect.href })
})
