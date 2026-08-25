import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/types.js"
import { config } from "../config.js"
import { verifyMcpApiKey } from "../lib/mcpApiKeys.js"
import { oauthProvider } from "../lib/oauthProvider.js"

// Protects /mcp. Tries the static API key path first (cheap prefix check, works
// in both local and cloud mode), then falls back to an OAuth access token
// (cloud only). On any failure — including a bare `initialize` call with no
// Authorization header at all — this returns 401 with a WWW-Authenticate header
// pointing at the RFC 9728 discovery doc for THIS resource (/mcp specifically,
// not the generic root path @hono/mcp's own bearerAuth() defaults to). Per the
// article this plan is based on, that header is load-bearing: skip it and
// claude.ai silently treats the connector as unauthenticated instead of starting
// the OAuth flow.
export const requireMcpAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null

  if (token) {
    const apiKeyGrant = await verifyMcpApiKey(token)
    if (apiKeyGrant) {
      c.set("mcpGrant", apiKeyGrant)
      await next()
      return
    }

    if (config.isCloud) {
      try {
        const authInfo = await oauthProvider.verifyAccessToken(token)
        const extra = authInfo.extra as { ownerId: string; outletIds: string[] | null }
        c.set("mcpGrant", { ownerId: extra.ownerId, outletIds: extra.outletIds })
        await next()
        return
      } catch {
        // fall through to 401
      }
    }
  }

  const resourceMetadataUrl = new URL("/.well-known/oauth-protected-resource/mcp", config.email.appUrl).href
  c.header("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`)
  return c.json({ error: "Missing or invalid MCP credentials" }, 401)
})
