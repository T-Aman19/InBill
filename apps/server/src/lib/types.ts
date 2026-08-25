import type { TokenPayload } from "@inbill/shared"

// Set by middleware/mcpAuth.ts for /mcp requests only — deliberately separate
// from `user` (JWT staff/owner auth) so the two auth contracts never mix up.
// outletIds null = every outlet the owner has.
export type McpGrant = {
  ownerId: string
  outletIds: string[] | null
}

export type AppEnv = {
  Variables: {
    user: TokenPayload
    mcpGrant?: McpGrant
  }
}
