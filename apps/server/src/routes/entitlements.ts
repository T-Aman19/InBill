import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { featureKeys, type FeatureKey } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { requireAuth } from "../middleware/auth.js"
import { getSnapshot, startTrial } from "../lib/entitlements.js"

export const entitlementsRouter = new Hono<AppEnv>()

entitlementsRouter.use("*", requireAuth)

// Full entitlement snapshot for the signed-in account — powers locks, badges
// and "X of N left" counters across the UI.
entitlementsRouter.get("/", async (c) => {
  const { ownerId } = c.get("user")
  return c.json({ features: await getSnapshot(ownerId) })
})

// Activate a per-feature free trial.
entitlementsRouter.post("/trials/:feature", async (c) => {
  const { ownerId } = c.get("user")
  const feature = c.req.param("feature") as FeatureKey
  if (!featureKeys.includes(feature)) throw new HTTPException(404, { message: "Unknown feature" })
  try {
    return c.json(await startTrial(ownerId, feature))
  } catch (e) {
    throw new HTTPException(409, { message: e instanceof Error ? e.message : "Cannot start trial" })
  }
})
