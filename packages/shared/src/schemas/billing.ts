import { z } from "zod"

export const discountTypeSchema = z.enum(["percentage", "flat"])
export type DiscountType = z.infer<typeof discountTypeSchema>

export const discountSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1),
  type: discountTypeSchema,
  value: z.number().positive(),
  minOrderValue: z.number().nonnegative().default(0),
  maxDiscountAmount: z.number().positive().optional(),
  code: z.string().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
  usageLimit: z.number().int().positive().optional(),
  usageCount: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
})

export const createDiscountSchema = discountSchema.omit({ id: true, outletId: true, usageCount: true })
export const updateDiscountSchema = createDiscountSchema.partial()

export const applyDiscountSchema = z.object({
  discountId: z.string().uuid().optional(),
  code: z.string().optional(),
  label: z.string().min(1),
  amount: z.number().positive(),
}).refine((d) => d.discountId !== undefined || d.code !== undefined || true)

export type Discount = z.infer<typeof discountSchema>
export type CreateDiscount = z.infer<typeof createDiscountSchema>
export type ApplyDiscount = z.infer<typeof applyDiscountSchema>

export const paymentModeSchema = z.enum(["cash", "card", "upi", "credit"])
export type PaymentMode = z.infer<typeof paymentModeSchema>

export const taxLineSchema = z.object({
  name: z.string(),
  rate: z.number(),
  amount: z.number(),
})

export const billPaymentSchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  mode: paymentModeSchema,
  amount: z.number().positive(),
  reference: z.string().optional(),
})

export const billSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  orderId: z.string().uuid(),
  billNumber: z.number().int().positive(),
  subtotal: z.number().nonnegative(),
  taxLines: z.array(taxLineSchema).default([]),
  taxTotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  discountNote: z.string().optional(),
  total: z.number().nonnegative(),
  payments: z.array(billPaymentSchema).default([]),
  isPaid: z.boolean().default(false),
  createdAt: z.string().datetime(),
})

export const createBillSchema = z.object({
  orderId: z.string().uuid(),
  discountAmount: z.number().nonnegative().optional(),
  discountNote: z.string().optional(),
})

export const addPaymentSchema = z.object({
  mode: paymentModeSchema,
  amount: z.number().positive(),
  reference: z.string().optional(),
})

export type Bill = z.infer<typeof billSchema>
export type BillPayment = z.infer<typeof billPaymentSchema>
export type CreateBill = z.infer<typeof createBillSchema>
export type AddPayment = z.infer<typeof addPaymentSchema>
