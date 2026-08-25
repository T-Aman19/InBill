// Static bearer keys for the MCP integration — the local-mode / power-user path
// (Claude Code, Claude Desktop custom-header config). See middleware/mcpAuth.ts
// for how these feed into the same {ownerId, outletIds} grant shape as OAuth.
import { eq, and, isNull } from "drizzle-orm"
import { db } from "../db/index.js"
import { mcpApiKeys } from "../db/schema/index.js"
import { hashToken, generateRawToken } from "./hashToken.js"

const KEY_PREFIX = "inbill_mcp_"

export async function createMcpApiKey(ownerId: string, opts: { outletId?: string | undefined; label: string }) {
  const rawKey = `${KEY_PREFIX}${generateRawToken(24)}`
  const keyHash = await hashToken(rawKey)
  const [row] = await db.insert(mcpApiKeys).values({
    ownerId,
    outletId: opts.outletId ?? null,
    label: opts.label,
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 6),
    keyHash,
  }).returning()
  return { id: row!.id, rawKey }
}

export async function verifyMcpApiKey(rawKey: string): Promise<{ ownerId: string; outletIds: string[] | null } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null
  const keyHash = await hashToken(rawKey)
  const row = await db.query.mcpApiKeys.findFirst({ where: and(eq(mcpApiKeys.keyHash, keyHash), isNull(mcpApiKeys.revokedAt)) })
  if (!row) return null
  await db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.id))
  return { ownerId: row.ownerId, outletIds: row.outletId ? [row.outletId] : null }
}

export async function listMcpApiKeys(ownerId: string) {
  const rows = await db.query.mcpApiKeys.findMany({
    where: eq(mcpApiKeys.ownerId, ownerId),
    orderBy: (k, { desc }) => [desc(k.createdAt)],
  })
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    outletId: r.outletId,
    keyPrefix: r.keyPrefix,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
    createdAt: r.createdAt,
  }))
}

export async function revokeMcpApiKey(ownerId: string, id: string): Promise<boolean> {
  const [row] = await db.update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpApiKeys.id, id), eq(mcpApiKeys.ownerId, ownerId), isNull(mcpApiKeys.revokedAt)))
    .returning()
  return !!row
}
