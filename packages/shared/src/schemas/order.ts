import { z } from "zod"

export const orderTypeSchema = z.enum(["dine_in", "takeaway", "delivery"])
export const orderStatusSchema = z.enum(["open", "kot_sent", "served", "billed", "cancelled"])
export const kotStatusSchema = z.enum(["pending", "acknowledged", "done"])

export type OrderType = z.infer<typeof orderTypeSchema>
export type OrderStatus = z.infer<typeof orderStatusSchema>
export type KotStatus = z.infer<typeof kotStatusSchema>

export const orderItemModifierSchema = z.object({
  modifierId: z.string().uuid(),
  name: z.string(),
  price: z.number().nonnegative(),
})

export const orderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().default(null),
  name: z.string(),
  variantName: z.string().nullable().default(null),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  modifiers: z.array(orderItemModifierSchema).default([]),
  notes: z.string().optional(),
  kotId: z.string().uuid().nullable().default(null),
  isVoided: z.boolean().default(false),
})

export const orderSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  tableId: z.string().uuid().nullable().default(null),
  type: orderTypeSchema,
  status: orderStatusSchema.default("open"),
  serverId: z.string().uuid().nullable().default(null),
  customerId: z.string().uuid().nullable().default(null),
  guestCount: z.number().int().positive().nullable().default(null),
  items: z.array(orderItemSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createOrderSchema = z.object({
  tableId: z.string().uuid().nullable().optional(),
  type: orderTypeSchema,
  guestCount: z.number().int().positive().optional(),
  customerId: z.string().uuid().optional(),
})

export const addOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive().default(1),
  modifiers: z.array(z.string().uuid()).default([]),
  notes: z.string().optional(),
})

export const kotSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  orderId: z.string().uuid(),
  kotNumber: z.number().int().positive(),
  status: kotStatusSchema.default("pending"),
  items: z.array(orderItemSchema),
  createdAt: z.string().datetime(),
})

export type Order = z.infer<typeof orderSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type Kot = z.infer<typeof kotSchema>
export type CreateOrder = z.infer<typeof createOrderSchema>
export type AddOrderItem = z.infer<typeof addOrderItemSchema>
