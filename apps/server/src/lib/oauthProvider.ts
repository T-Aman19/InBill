// InbillOAuthProvider — implements the MCP SDK's OAuthServerProvider interface,
// backed by our own DB tables (owners are the identity; the SPA's owner-login +
// a new consent screen stand in for a separate IdP). Passed into @hono/mcp's
// mcpAuthRouter(), which wires the actual RFC 8414/7591 wire endpoints
// (authorize/token/register/well-known) around this provider — see routes/oauth.ts.
//
// Opaque, hashed, DB-backed tokens throughout (not JWTs) so a revoke is instant
// and doesn't require a blocklist — same rationale as lib/mcpApiKeys.ts.
import type { Context } from "hono"
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js"
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js"
import { InvalidGrantError, InvalidClientError } from "@modelcontextprotocol/sdk/server/auth/errors.js"
import { eq, and } from "drizzle-orm"
import { db } from "../db/index.js"
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens, oauthRefreshTokens } from "../db/schema/index.js"
import { hashToken, generateRawToken } from "./hashToken.js"
import { config } from "../config.js"

const ACCESS_TOKEN_TTL_MS = 60 * 60_000 // 1h
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000 // 90d
export const AUTHORIZATION_CODE_TTL_MS = 60_000 // 60s

function toClientInformation(row: typeof oauthClients.$inferSelect): OAuthClientInformationFull {
  return {
    client_id: row.id,
    client_name: row.clientName,
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: row.tokenEndpointAuthMethod,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
  }
}

async function issueTokenPair(ownerId: string, clientId: string, outletIds: string[] | null): Promise<OAuthTokens> {
  const accessRaw = generateRawToken(32)
  const refreshRaw = generateRawToken(32)
  const [accessHash, refreshHash] = await Promise.all([hashToken(accessRaw), hashToken(refreshRaw)])

  await Promise.all([
    db.insert(oauthAccessTokens).values({
      tokenHash: accessHash, ownerId, clientId, outletIds,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    }),
    db.insert(oauthRefreshTokens).values({
      tokenHash: refreshHash, ownerId, clientId, outletIds,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    }),
  ])

  return { access_token: accessRaw, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refreshRaw }
}

class InbillClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) })
    return row ? toClientInformation(row) : undefined
  }

  // Called by @hono/mcp's clientRegistrationHandler, which — when clientIdGeneration
  // (the default) is on — has already populated client_id/client_id_issued_at before
  // calling us, despite the narrower Omit<...> the interface formally declares.
  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at"> & Partial<Pick<OAuthClientInformationFull, "client_id" | "client_id_issued_at">>,
  ): Promise<OAuthClientInformationFull> {
    const clientId = client.client_id ?? crypto.randomUUID()
    const issuedAt = client.client_id_issued_at ?? Math.floor(Date.now() / 1000)

    await db.insert(oauthClients).values({
      id: clientId,
      clientName: client.client_name ?? "Unnamed MCP client",
      redirectUris: client.redirect_uris,
      tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? "none",
    })

    return { ...client, client_id: clientId, client_id_issued_at: issuedAt }
  }
}

export class InbillOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = new InbillClientsStore()

  // GET/POST /oauth/authorize lands here after @hono/mcp validates client_id +
  // redirect_uri. We don't log the owner in or ask for consent ourselves — hand
  // off to the SPA's consent page, which resumes the flow via the owner's existing
  // JWT session and POST /api/oauth/authorize/approve (routes/oauth.ts).
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, c: Context): Promise<void> {
    const url = new URL("/owner/oauth-consent", config.email.appUrl)
    url.searchParams.set("client_id", client.client_id)
    url.searchParams.set("client_name", client.client_name ?? client.client_id)
    url.searchParams.set("redirect_uri", params.redirectUri)
    url.searchParams.set("code_challenge", params.codeChallenge)
    if (params.state) url.searchParams.set("state", params.state)
    c.res = c.redirect(url.toString(), 302)
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const row = await findAuthCode(client.client_id, authorizationCode)
    if (!row) throw new InvalidGrantError("Invalid authorization code")
    return row.codeChallenge
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string): Promise<OAuthTokens> {
    const row = await findAuthCode(client.client_id, authorizationCode)
    if (!row) throw new InvalidGrantError("Invalid authorization code")
    if (row.usedAt) throw new InvalidGrantError("Authorization code already used")
    if (row.expiresAt < new Date()) throw new InvalidGrantError("Authorization code expired")
    if (redirectUri && row.redirectUri !== redirectUri) throw new InvalidGrantError("redirect_uri does not match")

    await db.update(oauthAuthorizationCodes).set({ usedAt: new Date() }).where(eq(oauthAuthorizationCodes.id, row.id))
    return issueTokenPair(row.ownerId, client.client_id, row.outletIds as string[] | null)
  }

  // Rotates on every use (RFC 6749 best practice): the old refresh token is marked
  // revoked and chained via replacedByHash, so a *reused* old token — the classic
  // signal of a leaked token — is detectable and rejected on its next use.
  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const tokenHash = await hashToken(refreshToken)
    const row = await db.query.oauthRefreshTokens.findFirst({
      where: and(eq(oauthRefreshTokens.tokenHash, tokenHash), eq(oauthRefreshTokens.clientId, client.client_id)),
    })
    if (!row) throw new InvalidGrantError("Invalid refresh token")
    if (row.revokedAt) throw new InvalidGrantError("Refresh token has already been used")
    if (row.expiresAt < new Date()) throw new InvalidGrantError("Refresh token expired")

    const pair = await issueTokenPair(row.ownerId, client.client_id, row.outletIds as string[] | null)
    const newHash = await hashToken(pair.refresh_token!)
    await db.update(oauthRefreshTokens).set({ revokedAt: new Date(), replacedByHash: newHash }).where(eq(oauthRefreshTokens.id, row.id))
    return pair
  }

  // Called directly by middleware/mcpAuth.ts (not by mcpAuthRouter itself — that
  // only wires the AS endpoints, not resource-server protection of /mcp).
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tokenHash = await hashToken(token)
    const row = await db.query.oauthAccessTokens.findFirst({ where: eq(oauthAccessTokens.tokenHash, tokenHash) })
    if (!row || row.expiresAt < new Date()) throw new InvalidGrantError("Invalid or expired access token")
    return {
      token,
      clientId: row.clientId,
      scopes: [],
      expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
      extra: { ownerId: row.ownerId, outletIds: row.outletIds as string[] | null },
    }
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const tokenHash = await hashToken(request.token)
    await Promise.all([
      db.update(oauthAccessTokens).set({ expiresAt: new Date(0) })
        .where(and(eq(oauthAccessTokens.tokenHash, tokenHash), eq(oauthAccessTokens.clientId, client.client_id))),
      db.update(oauthRefreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), eq(oauthRefreshTokens.clientId, client.client_id))),
    ])
  }
}

async function findAuthCode(clientId: string, authorizationCode: string) {
  const codeHash = await hashToken(authorizationCode)
  return db.query.oauthAuthorizationCodes.findFirst({
    where: and(eq(oauthAuthorizationCodes.codeHash, codeHash), eq(oauthAuthorizationCodes.clientId, clientId)),
  })
}

// Used by the /api/oauth/authorize/approve endpoint (routes/oauth.ts) — mints the
// code that exchangeAuthorizationCode above will later redeem. Re-validates the
// client owns the redirect_uri server-side (defense in depth beyond what
// @hono/mcp's authorizeHandler already checked before redirecting to consent).
export async function createAuthorizationCode(opts: {
  ownerId: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  outletIds: string[] | null
}): Promise<string> {
  const client = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, opts.clientId) })
  if (!client) throw new InvalidClientError("Unknown client_id")
  if (!client.redirectUris.includes(opts.redirectUri)) throw new InvalidClientError("redirect_uri is not registered for this client")

  const rawCode = generateRawToken(32)
  const codeHash = await hashToken(rawCode)
  await db.insert(oauthAuthorizationCodes).values({
    codeHash,
    ownerId: opts.ownerId,
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    codeChallenge: opts.codeChallenge,
    codeChallengeMethod: "S256",
    outletIds: opts.outletIds,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
  })
  return rawCode
}

export const oauthProvider = new InbillOAuthProvider()
