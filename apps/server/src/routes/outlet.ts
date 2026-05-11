import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { updateOutletSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { outlets } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"

export const outletRouter = new Hono<AppEnv>()

outletRouter.use("*", requireAuth)

outletRouter.get("/", async (c) => {
  const { outletId } = c.get("user")
  const outlet = await db.query.outlets.findFirst({ where: eq(outlets.id, outletId) })
  if (!outlet) return c.json({ error: "Outlet not found" }, 404)
  return c.json(outlet)
})

outletRouter.patch("/", requireRole("owner", "manager"), zValidator("json", updateOutletSchema), async (c) => {
  const { outletId } = c.get("user")
  const data = c.req.valid("json")
  const [outlet] = await db.update(outlets).set(data).where(eq(outlets.id, outletId)).returning()
  return c.json(outlet)
})
