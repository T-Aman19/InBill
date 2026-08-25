import { pgTable, uuid, text, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core"
import { owners, outlets } from "./owners.js"

// Static bearer keys for the MCP integration — the local-mode / power-user path
// (Claude Code, Claude Desktop custom-header config). outletId null = all outlets.
// Raw key is never stored, only its SHA-256 hash (same pattern as owner_password_resets).
export const mcpApiKeys = pgTable("mcp_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_mcp_api_keys_hash").on(t.keyHash)])

// RFC 7591 dynamic client registration — any MCP client (claude.ai, etc.) self-registers
// here before starting the OAuth flow. Public clients only (PKCE, no client secret).
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  clientName: text("client_name").notNull(),
  redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Short-lived (~60s), single-use authorization codes from the /oauth/authorize consent
// step. outletIds null = the owner granted access to every outlet they have.
export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeHash: text("code_hash").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  outletIds: jsonb("outlet_ids").$type<string[] | null>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_oauth_codes_hash").on(t.codeHash)])

export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  outletIds: jsonb("outlet_ids").$type<string[] | null>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_oauth_access_tokens_hash").on(t.tokenHash)])

// Rotated on every refresh (RFC 6749 best practice) — replacedByHash chains the
// history so a reused (already-rotated) refresh token is detectable and rejected.
export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  outletIds: jsonb("outlet_ids").$type<string[] | null>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedByHash: text("replaced_by_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_oauth_refresh_tokens_hash").on(t.tokenHash)])
