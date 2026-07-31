import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { eq, and, gte, lte } from "drizzle-orm"
import { GoogleGenAI } from "@google/genai"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, menuItems } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { requireFeature } from "../middleware/entitlement.js"
import { consumeFeature } from "../lib/entitlements.js"
import { config } from "../config.js"
import { dayStart, dayEnd } from "../lib/dateRange.js"

export const aiRouter = new Hono<AppEnv>()

aiRouter.use("*", requireAuth, requireRole("manager", "owner"))

const client = new GoogleGenAI({ apiKey: config.ai.geminiApiKey })

// ── AI1: Menu description generator ─────────────────────────────────────────
aiRouter.post(
  "/menu-description",
  requireFeature("ai_menu_description"),
  zValidator("json", z.object({ name: z.string().min(1), category: z.string().default(""), dietaryType: z.enum(["veg", "non-veg"]).default("veg") })),
  async (c) => {
    if (!config.ai.geminiApiKey) return c.json({ error: "AI features are not configured on this server" }, 503)
    const { ownerId } = c.get("user")
    const { name, category, dietaryType } = c.req.valid("json")

    const response = await client.models.generateContent({
      model: config.ai.geminiModel,
      contents: `Write a description for: Name: ${name}, Category: ${category || "General"}, Type: ${dietaryType === "veg" ? "Vegetarian" : "Non-vegetarian"}`,
      config: {
        systemInstruction: "You are a professional menu copywriter for Indian restaurants. Write a single compelling 1–2 sentence description for a menu item. Be appetizing and concise. Return only the description text, no quotes.",
        maxOutputTokens: 150,
        // A one-line description needs no reasoning — skip thinking to keep latency down.
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    // Count usage only after the (billable) call succeeds.
    await consumeFeature(ownerId, "ai_menu_description")
    return c.json({ description: (response.text ?? "").trim() })
  },
)

// ── AI3: Natural language report queries ──────────────────────────────────────
// Quota is enforced by the entitlement layer (metered per owner/month on the
// managed cloud; unlimited when self-hosted). See lib/entitlements.ts.

aiRouter.post(
  "/reports-query",
  requireFeature("ai_reports"),
  zValidator("json", z.object({ question: z.string().min(1), from: z.string().optional(), to: z.string().optional() })),
  async (c) => {
    if (!config.ai.geminiApiKey) return c.json({ error: "AI features are not configured on this server" }, 503)
    const { outletId, ownerId } = c.get("user")

    const { question, from, to } = c.req.valid("json")
    const today = new Date().toISOString().split("T")[0]!
    const rangeFrom = from ?? today
    const rangeTo = to ?? today

    // Fetch compact data snapshot
    const [paidBills, topItems] = await Promise.all([
      db.query.bills.findMany({
        where: and(
          eq(bills.outletId, outletId),
          eq(bills.isPaid, true),
          eq(bills.isVoided, false),
          gte(bills.createdAt, dayStart(rangeFrom)),
          lte(bills.createdAt, dayEnd(rangeTo)),
        ),
        columns: { id: true, total: true, discountAmount: true, taxTotal: true, createdAt: true },
        with: { payments: { columns: { mode: true, amount: true } } },
        limit: 500,
      }),
      db.query.menuItems.findMany({
        where: eq(menuItems.outletId, outletId),
        columns: { id: true, name: true, basePrice: true },
        limit: 200,
      }),
    ])

    const totalRevenue = paidBills.reduce((s, b) => s + Number(b.total), 0)
    const totalBills = paidBills.length
    const totalTax = paidBills.reduce((s, b) => s + Number(b.taxTotal), 0)
    const totalDiscount = paidBills.reduce((s, b) => s + Number(b.discountAmount), 0)
    const avgBill = totalBills > 0 ? totalRevenue / totalBills : 0

    const paymentBreakdown: Record<string, number> = {}
    for (const bill of paidBills) {
      for (const p of bill.payments ?? []) {
        paymentBreakdown[p.mode] = (paymentBreakdown[p.mode] ?? 0) + Number(p.amount)
      }
    }

    const dataSnapshot = `
Date range: ${rangeFrom} to ${rangeTo}
Total bills: ${totalBills}
Total revenue: ₹${totalRevenue.toFixed(2)}
Average bill value: ₹${avgBill.toFixed(2)}
Total tax collected: ₹${totalTax.toFixed(2)}
Total discount given: ₹${totalDiscount.toFixed(2)}
Payment modes: ${Object.entries(paymentBreakdown).map(([m, a]) => `${m}: ₹${a.toFixed(2)}`).join(", ") || "none"}
Menu items available: ${topItems.length}
`.trim()

    const response = await client.models.generateContent({
      model: config.ai.geminiProModel,
      contents: `Data snapshot:\n${dataSnapshot}\n\nQuestion: ${question}`,
      config: {
        systemInstruction: "You are an expert restaurant business analyst. Answer questions about restaurant performance data concisely and helpfully. Use Indian currency (₹). Be direct and actionable. Return a plain text answer without markdown headers.",
        // Dynamic thinking consumes output tokens, so the budget must leave room
        // for the answer after thinking — too tight a cap could return "".
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingBudget: -1 },
      },
    })

    await consumeFeature(ownerId, "ai_reports")
    return c.json({ answer: (response.text ?? "").trim() })
  },
)
