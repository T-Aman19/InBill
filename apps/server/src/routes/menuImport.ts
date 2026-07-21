import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { zValidator } from "@hono/zod-validator"
import { eq, and, sql } from "drizzle-orm"
import { GoogleGenAI, Type, MediaResolution } from "@google/genai"
import { extractedMenuSchema, commitMenuImportSchema } from "@inbill/shared"
import type { AppEnv } from "../lib/types.js"
import { db } from "../db/index.js"
import { categories, menuItems, itemVariants, modifierGroups, modifiers } from "../db/schema/index.js"
import { requireAuth, requireRole } from "../middleware/auth.js"
import { config } from "../config.js"

export const menuImportRouter = new Hono<AppEnv>()

menuImportRouter.use("*", requireAuth, requireRole("manager", "owner"))

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])

// This is an occasional onboarding action, not a hot path — a generous but
// non-zero daily cap is enough to stop runaway Gemini spend from a bug or abuse.
const DAILY_LIMIT = 10
const rateLimitMap = new Map<string, { date: string; count: number }>()
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

const client = new GoogleGenAI({ apiKey: config.ai.geminiApiKey })

// Mirrors extractedMenuSchema — Gemini structured-output schema (its own
// dialect, not a JSON-Schema library), so the two must be kept in sync by hand.
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING, nullable: true },
                price: { type: Type.NUMBER },
                isVeg: { type: Type.BOOLEAN },
                variants: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                    },
                    required: ["name", "price"],
                  },
                },
              },
              required: ["name", "price", "isVeg"],
            },
          },
        },
        required: ["name", "items"],
      },
    },
    modifierGroups: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
              },
              required: ["name", "price"],
            },
          },
        },
        required: ["name", "options"],
      },
    },
  },
  required: ["categories", "modifierGroups"],
}

const EXTRACTION_PROMPT = `You are reading a restaurant menu (a photo or a PDF, possibly multiple pages, columns, or sections). Extract every category, item, price, and add-on option group into structured data.

Rules:
- Group items under their printed category headings (e.g. "Starters", "Main Course", "Beverages"). If an item has no visible category, put it under "Menu".
- "price" must be a plain number with currency symbols and commas stripped (e.g. "₹1,200" -> 1200).
- If an item lists multiple sizes/portions with different prices (e.g. Half/Full, Small/Medium/Large, Regular/Large), put each as a separate entry in "variants" with its own name and price, and set the item's own "price" to the lowest variant price. If there is only one price, leave "variants" empty and set "price" to that value.
- Set "isVeg" to false only when the item is clearly marked non-vegetarian (a red/brown dot or square symbol, or the words "non-veg"/"chicken"/"mutton"/"fish"/"egg"/"prawn" etc. in the name). Default to true (vegetarian) when genuinely ambiguous.
- Include the printed description only if the menu actually prints one for that item — otherwise omit it (do not invent descriptions).
- Skip section headers, page numbers, restaurant branding, and anything that isn't an orderable item with a price.
- IMPORTANT — do not turn add-on sections into a fake category: a line like "ADD ON FLAVOURS @39/-: Vanilla | Hazelnut | Caramel | Irish | Coconut" is not a menu category with five separate dishes. It's a single option group of paid extras that customers add to OTHER items. Put it in "modifierGroups" instead: one entry with "name" (e.g. "Add on flavours") and "options" (each flavour/extra as its own {name, price} — if only one shared price is printed, apply it to every option). Recognize this pattern for any wording like "Add-ons", "Extras", "Toppings", "Choice of", etc. where a shared price applies to a list of optional extras rather than standalone dishes.
- If the image/PDF does not look like a menu at all, return empty "categories" and "modifierGroups" arrays.`

// ── POST /api/menu-import/extract ────────────────────────────────────────────
menuImportRouter.post(
  "/extract",
  bodyLimit({
    maxSize: MAX_FILE_BYTES,
    onError: (c) => c.json({ error: "File too large (max 15MB)" }, 413),
  }),
  async (c) => {
    const { outletId } = c.get("user")
    if (!config.ai.geminiApiKey) return c.json({ error: "Menu import is not configured on this server" }, 503)
    if (!checkRateLimit(outletId)) return c.json({ error: "Daily menu import limit reached (10/day)" }, 429)

    const body = await c.req.parseBody()
    const file = body["file"]
    if (!(file instanceof File)) return c.json({ error: "No file uploaded" }, 400)
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return c.json({ error: "Unsupported file type — upload a JPEG, PNG, WebP, or PDF" }, 400)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const base64Data = Buffer.from(bytes).toString("base64")

    let response
    try {
      response = await client.models.generateContent({
        model: config.ai.geminiModel,
        contents: [
          {
            role: "user",
            parts: [{ text: EXTRACTION_PROMPT }, { inlineData: { mimeType: file.type, data: base64Data } }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          // Extraction is transcription + structuring against an explicit rule
          // set, not open-ended reasoning — thinking tokens are invisible in
          // response.text but still billed as output, and were the dominant
          // cost here (~12k output tokens for a 14-item menu). Disabling
          // thinking cuts that to roughly the size of the JSON itself. If
          // extraction quality regresses on tricky layouts, raise this to a
          // small fixed budget (e.g. 512) rather than -1 (automatic).
          thinkingConfig: { thinkingBudget: 0 },
          // Menus are text-dense (small price print, multi-column layout) —
          // MEDIUM (256 tokens/page) balances legibility against LOW (64
          // tokens/page), which risks losing small print, especially on
          // multi-page PDFs where every page is billed separately.
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          // Safety ceiling, not a normal-case lever — caps worst-case cost if
          // a garbled/very long document sends the model into a runaway list.
          maxOutputTokens: 32_768,
        },
      })
    } catch (e) {
      console.error("[menu-import] Gemini request failed:", e)
      return c.json({ error: "Menu extraction failed — please try again" }, 502)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(response.text ?? "")
    } catch {
      return c.json({ error: "Could not read a menu from this file — try a clearer photo or scan" }, 422)
    }

    // Never trust raw model output — validate before it reaches the client.
    const result = extractedMenuSchema.safeParse(parsed)
    if (!result.success) {
      console.error("[menu-import] Gemini output failed validation:", result.error.flatten())
      return c.json({ error: "Could not read a menu from this file — try a clearer photo or scan" }, 422)
    }
    if (result.data.categories.length === 0) {
      return c.json({ error: "No menu items found in this file" }, 422)
    }

    return c.json(result.data)
  },
)

// ── POST /api/menu-import/commit ─────────────────────────────────────────────
menuImportRouter.post("/commit", zValidator("json", commitMenuImportSchema), async (c) => {
  const { outletId } = c.get("user")
  const { categories: importCategories, modifierGroups: importGroups } = c.req.valid("json")

  let categoriesCreated = 0
  let itemsCreated = 0
  let modifierGroupsCreated = 0

  await db.transaction(async (tx) => {
    // Modifier groups are created unlinked to any item — the printed page
    // rarely makes "which items" unambiguous, so the user attaches them
    // afterward from each item's edit panel (existing linkModifierGroup flow).
    for (const importGroup of importGroups) {
      const [group] = await tx
        .insert(modifierGroups)
        .values({ outletId, name: importGroup.name.trim(), multiSelect: true })
        .returning()
      modifierGroupsCreated++

      if (importGroup.options.length > 0) {
        await tx.insert(modifiers).values(
          importGroup.options.map((o) => ({ groupId: group!.id, name: o.name.trim(), price: String(o.price) })),
        )
      }
    }

    // Only match against active categories — matching a soft-deleted one (see
    // the DELETE /categories/:id handler in menu.ts, which sets isActive:false
    // rather than removing the row) would silently reuse it, still-inactive,
    // dumping new items into a category nothing ever displays.
    const existing = await tx.query.categories.findMany({ where: and(eq(categories.outletId, outletId), eq(categories.isActive, true)) })
    const byName = new Map(existing.map((cat) => [cat.name.trim().toLowerCase(), cat]))

    for (const importCat of importCategories) {
      const key = importCat.name.trim().toLowerCase()
      let categoryId = byName.get(key)?.id

      if (!categoryId) {
        const [maxSort] = await tx
          .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)` })
          .from(categories)
          .where(eq(categories.outletId, outletId))
        const [cat] = await tx
          .insert(categories)
          .values({ outletId, name: importCat.name.trim(), sortOrder: (maxSort?.max ?? -1) + 1 })
          .returning()
        categoryId = cat!.id
        byName.set(key, cat!)
        categoriesCreated++
      }

      for (const importItem of importCat.items) {
        const [item] = await tx
          .insert(menuItems)
          .values({
            outletId,
            categoryId,
            name: importItem.name.trim(),
            description: importItem.description ?? null,
            basePrice: String(importItem.price),
            isVeg: importItem.isVeg,
          })
          .returning()
        itemsCreated++

        if (importItem.variants.length > 0) {
          await tx.insert(itemVariants).values(
            importItem.variants.map((v) => ({ itemId: item!.id, name: v.name.trim(), price: String(v.price) })),
          )
        }
      }
    }
  })

  return c.json({ categoriesCreated, itemsCreated, modifierGroupsCreated }, 201)
})
