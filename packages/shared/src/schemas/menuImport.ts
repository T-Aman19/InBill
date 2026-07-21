import { z } from "zod"

// Price bounds mirror menu.ts's priceSchema.
const priceSchema = z.number().nonnegative().max(1_000_000)

// ── Extraction result (Gemini output, validated before it ever reaches the client) ──

export const extractedVariantSchema = z.object({
  name: z.string().min(1).max(100),
  price: priceSchema,
})

export const extractedItemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().default(null),
  price: priceSchema,
  isVeg: z.boolean().default(true),
  variants: z.array(extractedVariantSchema).default([]),
})

export const extractedCategorySchema = z.object({
  name: z.string().min(1).max(100),
  items: z.array(extractedItemSchema).default([]),
})

export const extractedMenuSchema = z.object({
  categories: z.array(extractedCategorySchema).default([]),
})

export type ExtractedVariant = z.infer<typeof extractedVariantSchema>
export type ExtractedItem = z.infer<typeof extractedItemSchema>
export type ExtractedCategory = z.infer<typeof extractedCategorySchema>
export type ExtractedMenu = z.infer<typeof extractedMenuSchema>

// ── Commit payload (client-reviewed/edited version of the above) ────────────

export const commitMenuImportSchema = z.object({
  categories: z.array(extractedCategorySchema).min(1),
})

export type CommitMenuImport = z.infer<typeof commitMenuImportSchema>
