import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import type { AppEnv } from "../lib/types.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { createMcpApiKey, listMcpApiKeys, revokeMcpApiKey } from "../lib/mcpApiKeys.js"

export const mcpKeysRouter = new Hono<AppEnv>()

mcpKeysRouter.use("*", requireAuth, requireRole("owner"))

mcpKeysRouter.get("/", async (c) => {
  const { ownerId } = c.get("user")
  return c.json(await listMcpApiKeys(ownerId))
})

const createSchema = z.object({ label: z.string().min(1).max(100), outletId: z.string().uuid().optional() })

mcpKeysRouter.post("/", zValidator("json", createSchema), async (c) => {
  const { ownerId } = c.get("user")
  const { label, outletId } = c.req.valid("json")
  const { id, rawKey } = await createMcpApiKey(ownerId, { label, outletId })
  // The raw key is only ever visible in this one response — only its hash is stored.
  return c.json({ id, key: rawKey }, 201)
})

mcpKeysRouter.delete("/:id", async (c) => {
  const { ownerId } = c.get("user")
  const ok = await revokeMcpApiKey(ownerId, c.req.param("id"))
  if (!ok) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})
