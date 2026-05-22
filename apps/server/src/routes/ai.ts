import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { eq, and, gte, lte } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { bills, menuItems } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { config } from "../config.js"

export const aiRouter = new Hono<AppEnv>()

aiRouter.use("*", requireAuth, requireRole("manager", "owner"))

const client = new Anthropic({ apiKey: config.ai.anthropicApiKey })

// ── AI1: Menu description generator ─────────────────────────────────────────
aiRouter.post(
  "/menu-description",
  zValidator("json", z.object({ name: z.string().min(1), category: z.string().default(""), dietaryType: z.enum(["veg", "non-veg"]).default("veg") })),
  async (c) => {
    const { name, category, dietaryType } = c.req.valid("json")

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: [
        {
          type: "text",
          text: "You are a professional menu copywriter for Indian restaurants. Write a single compelling 1–2 sentence description for a menu item. Be appetizing and concise. Return only the description text, no quotes.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Write a description for: Name: ${name}, Category: ${category || "General"}, Type: ${dietaryType === "veg" ? "Vegetarian" : "Non-vegetarian"}`,
        },
      ],
    })

    const text = message.content.find((b) => b.type === "text")?.text ?? ""
    return c.json({ description: text.trim() })
  },
)

// ── AI3: Natural language report queries ──────────────────────────────────────
const rateLimitMap = new Map<string, { date: string; count: number }>()
const DAILY_LIMIT = 20

function checkRateLimit(outletId: string): boolean {
  const today = new Date().toISOString().split("T")[0]!
  const entry = rateLimitMap.get(outletId)
  if (!entry || entry.date !== today) {
    rateLimitMap.set(outletId, { date: today, count: 1 })
    return true
  }
  if (entry.count >= DAILY_LIMIT) return false
  entry.count++
  return true
}

aiRouter.post(
  "/reports-query",
  zValidator("json", z.object({ question: z.string().min(1), from: z.string().optional(), to: z.string().optional() })),
  async (c) => {
    const { outletId } = c.get("user")
    if (!checkRateLimit(outletId)) {
      return c.json({ error: "Daily query limit reached (20/day)" }, 429)
    }

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
          gte(bills.createdAt, new Date(rangeFrom)),
          lte(bills.createdAt, new Date(rangeTo + "T23:59:59Z")),
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

    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 400,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: "You are an expert restaurant business analyst. Answer questions about restaurant performance data concisely and helpfully. Use Indian currency (₹). Be direct and actionable. Return a plain text answer without markdown headers.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Data snapshot:\n${dataSnapshot}\n\nQuestion: ${question}`,
        },
      ],
    })

    const answer = message.content.find((b) => b.type === "text")?.text ?? ""
    return c.json({ answer: answer.trim() })
  },
)
