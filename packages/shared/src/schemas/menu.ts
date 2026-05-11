import { z } from "zod"

export const categorySchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

export const modifierGroupSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1),
  required: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  minSelect: z.number().int().default(0),
  maxSelect: z.number().int().nullable().default(null),
})

export const modifierSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  isActive: z.boolean().default(true),
})

export const itemVariantSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  isActive: z.boolean().default(true),
})

export const menuItemSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  basePrice: z.number().nonnegative(),
  taxCategoryId: z.string().uuid().nullable().default(null),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  variants: z.array(itemVariantSchema).default([]),
  modifierGroups: z.array(z.string().uuid()).default([]),
})

export const createMenuItemSchema = menuItemSchema.omit({ id: true, outletId: true, variants: true, modifierGroups: true })
export const updateMenuItemSchema = createMenuItemSchema.partial()
export const updateItemAvailabilitySchema = z.object({ isAvailable: z.boolean() })

export const createCategorySchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) })
export const updateCategorySchema = createCategorySchema.partial()

export const createVariantSchema = z.object({ name: z.string().min(1), price: z.number().nonnegative() })
export const updateVariantSchema = createVariantSchema.partial()

export const createModifierGroupSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  minSelect: z.number().int().default(0),
  maxSelect: z.number().int().nullable().default(null),
})
export const updateModifierGroupSchema = createModifierGroupSchema.partial()

export const createModifierSchema = z.object({ name: z.string().min(1), price: z.number().nonnegative().default(0) })
export const updateModifierSchema = createModifierSchema.partial()

export const taxConfigSchema = z.object({
  name: z.string().min(1).default("Default"),
  cgstRate: z.number().min(0).max(50).default(0),
  sgstRate: z.number().min(0).max(50).default(0),
  igstRate: z.number().min(0).max(50).default(0),
})
export type TaxConfig = z.infer<typeof taxConfigSchema> & { id: string }

export type Category = z.infer<typeof categorySchema>
export type MenuItem = z.infer<typeof menuItemSchema>
export type ItemVariant = z.infer<typeof itemVariantSchema>
export type ModifierGroup = z.infer<typeof modifierGroupSchema>
export type Modifier = z.infer<typeof modifierSchema>
