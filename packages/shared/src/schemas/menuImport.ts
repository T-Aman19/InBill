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

// A priced option list that applies across multiple items (e.g. "Add-on
// flavours @39: Vanilla, Hazelnut, Caramel") — not an orderable dish on its
// own, so it must not become a category. Maps to the existing modifierGroups/
// modifiers tables; left unlinked to any item on import (the printed page
// rarely makes the applicable items unambiguous) — the user attaches it to
// specific items afterward from each item's edit panel.
export const extractedModifierSchema = z.object({
  name: z.string().min(1).max(100),
  price: priceSchema,
})

export const extractedModifierGroupSchema = z.object({
  name: z.string().min(1).max(100),
  options: z.array(extractedModifierSchema).default([]),
})

export const extractedMenuSchema = z.object({
  categories: z.array(extractedCategorySchema).default([]),
  modifierGroups: z.array(extractedModifierGroupSchema).default([]),
})

export type ExtractedVariant = z.infer<typeof extractedVariantSchema>
export type ExtractedItem = z.infer<typeof extractedItemSchema>
export type ExtractedCategory = z.infer<typeof extractedCategorySchema>
export type ExtractedModifier = z.infer<typeof extractedModifierSchema>
export type ExtractedModifierGroup = z.infer<typeof extractedModifierGroupSchema>
export type ExtractedMenu = z.infer<typeof extractedMenuSchema>

// ── Commit payload (client-reviewed/edited version of the above) ────────────

export const commitMenuImportSchema = z.object({
  categories: z.array(extractedCategorySchema).default([]),
  modifierGroups: z.array(extractedModifierGroupSchema).default([]),
}).refine((d) => d.categories.length > 0 || d.modifierGroups.length > 0, { message: "Nothing to import" })

export type CommitMenuImport = z.infer<typeof commitMenuImportSchema>
