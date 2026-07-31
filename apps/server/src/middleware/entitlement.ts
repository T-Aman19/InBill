import { createMiddleware } from "hono/factory"
import type { FeatureKey } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { resolveFeature } from "../lib/entitlements.js"

/**
 * Gate a route behind a feature. Passes when the feature is usable
 * (allowed / trial / metered-with-quota-left); otherwise short-circuits with a
 * structured HTTP 402 the client can turn into an upgrade prompt.
 *
 * For metered features, this only checks that quota remains — the route must
 * call `consumeFeature()` after the work succeeds so failed calls aren't billed.
 */
export const requireFeature = (feature: FeatureKey) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { ownerId } = c.get("user")
    const d = await resolveFeature(ownerId, feature)

    if (d.state === "allowed" || d.state === "trial" || d.state === "metered") {
      await next()
      return
    }

    return c.json(
      {
        error: `${d.label} isn't included in your plan`,
        gate: {
          feature,
          reason: d.reason ?? "plan_required",
          requiredPlan: d.requiredPlan,
          remaining: d.remaining,
          resetsAt: d.resetsAt,
          trialAvailable: d.trialAvailable,
          trialDays: d.trialDays,
          byok: d.byok,
        },
      },
      402,
    )
  })
