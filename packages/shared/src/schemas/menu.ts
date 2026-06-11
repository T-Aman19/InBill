import { z } from "zod"

// HSN code must be exactly 6 or 8 digits per GST rules
const hsnCodeSchema = z
  .string()
  .regex(/^\d{6}(\d{2})?$/, "HSN code must be exactly 6 or 8 digits")

// Price: non-negative, max ₹10,00,000
const priceSchema = z.number().nonnegative().max(1_000_000)

// Tax rate: 0–50% per slab
const taxRateSchema = z.number().min(0).max(50)

export const categorySchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
})

export const modifierGroupSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1).max(100),
  required: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  minSelect: z.number().int().min(0).max(20).default(0),
  maxSelect: z.number().int().min(1).max(20).nullable().default(null),
})

export const modifierSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string().min(1).max(100),
  price: priceSchema,
  isActive: z.boolean().default(true),
})

export const itemVariantSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  name: z.string().min(1).max(100),
  price: priceSchema,
  isActive: z.boolean().default(true),
})

export const menuItemSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  basePrice: priceSchema,
  taxCategoryId: z.string().uuid().nullable().default(null),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  hsnCode: hsnCodeSchema.optional(),
  imageUrl: z.string().url().max(2048).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  variants: z.array(itemVariantSchema).default([]),
  modifierGroups: z.array(z.string().uuid()).default([]),
})

export const createMenuItemSchema = menuItemSchema.omit({ id: true, outletId: true, variants: true, modifierGroups: true })
export const updateMenuItemSchema = createMenuItemSchema.partial()
export const updateItemAvailabilitySchema = z.object({ isAvailable: z.boolean() })

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})
export const updateCategorySchema = createCategorySchema.partial()

export const createVariantSchema = z.object({
  name: z.string().min(1).max(100),
  price: priceSchema,
})
export const updateVariantSchema = createVariantSchema.partial()

export const createModifierGroupSchema = z.object({
  name: z.string().min(1).max(100),
  required: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  minSelect: z.number().int().min(0).max(20).default(0),
  maxSelect: z.number().int().min(1).max(20).nullable().default(null),
})
export const updateModifierGroupSchema = createModifierGroupSchema.partial()

export const createModifierSchema = z.object({
  name: z.string().min(1).max(100),
  price: priceSchema.default(0),
})
export const updateModifierSchema = createModifierSchema.partial()

export const taxConfigSchema = z
  .object({
    name: z.string().min(1).max(100).default("Default"),
    cgstRate: taxRateSchema.default(0),
    sgstRate: taxRateSchema.default(0),
    igstRate: taxRateSchema.default(0),
  })
  .refine(
    (d) => d.cgstRate + d.sgstRate <= 50,
    { message: "Combined CGST + SGST cannot exceed 50%" },
  )

export type TaxConfig = z.infer<typeof taxConfigSchema> & { id: string }

export type Category = z.infer<typeof categorySchema>
export type MenuItem = z.infer<typeof menuItemSchema>
export type ItemVariant = z.infer<typeof itemVariantSchema>
export type ModifierGroup = z.infer<typeof modifierGroupSchema>
export type Modifier = z.infer<typeof modifierSchema>