import { z } from "zod"

export const discountTypeSchema = z.enum(["percentage", "flat"])
export type DiscountType = z.infer<typeof discountTypeSchema>

const discountRefinements = (schema: z.ZodTypeAny) =>
  schema
    .refine(
      (d: { validFrom?: string; validTo?: string }) => {
        if (!d.validFrom || !d.validTo) return true
        return new Date(d.validFrom) <= new Date(d.validTo)
      },
      { message: "validFrom must be on or before validTo", path: ["validTo"] },
    )
    .refine(
      (d: { type: string; value: number }) => {
        if (d.type !== "percentage") return true
        return d.value <= 100
      },
      { message: "Percentage discount value cannot exceed 100%", path: ["value"] },
    )

export const discountSchema = discountRefinements(
  z.object({
    id: z.string().uuid(),
    outletId: z.string().uuid(),
    name: z.string().min(1).max(100),
    type: discountTypeSchema,
    value: z.number().positive().max(1_000_000),
    minOrderValue: z.number().nonnegative().max(1_000_000).default(0),
    maxDiscountAmount: z.number().positive().max(1_000_000).optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_-]{1,20}$/, "Coupon code must be 1–20 uppercase letters, digits, _ or -")
      .optional(),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
    usageLimit: z.number().int().positive().max(1_000_000).optional(),
    usageCount: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
  }),
)

export const createDiscountSchema = discountRefinements(
  z.object({
    name: z.string().min(1).max(100),
    type: discountTypeSchema,
    value: z.number().positive().max(1_000_000),
    minOrderValue: z.number().nonnegative().max(1_000_000).default(0),
    maxDiscountAmount: z.number().positive().max(1_000_000).optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_-]{1,20}$/, "Coupon code must be 1–20 uppercase letters, digits, _ or -")
      .optional(),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
    validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
    usageLimit: z.number().int().positive().max(1_000_000).optional(),
    isActive: z.boolean().default(true),
  }),
)

export const updateDiscountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: discountTypeSchema.optional(),
  value: z.number().positive().max(1_000_000).optional(),
  minOrderValue: z.number().nonnegative().max(1_000_000).optional(),
  maxDiscountAmount: z.number().positive().max(1_000_000).nullable().optional(),
  code: z
    .string()
    .regex(/^[A-Z0-9_-]{1,20}$/, "Coupon code must be 1–20 uppercase letters, digits, _ or -")
    .nullable()
    .optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).nullable().optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).nullable().optional(),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
})

export const applyDiscountSchema = z
  .object({
    discountId: z.string().uuid().optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_-]{1,20}$/, "Coupon code must be 1–20 uppercase letters, digits, _ or -")
      .optional(),
    label: z.string().min(1).max(100),
    amount: z.number().positive().max(1_000_000),
  })
  .refine(
    (d) => d.discountId !== undefined || d.code !== undefined,
    { message: "Either discountId or code must be provided" },
  )

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
  amount: z.number().positive().max(1_000_000),
  reference: z.string().max(200).optional(),
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
  discountNote: z.string().max(200).optional(),
  total: z.number().nonnegative(),
  payments: z.array(billPaymentSchema).default([]),
  isPaid: z.boolean().default(false),
  createdAt: z.string().datetime(),
})

export const createBillSchema = z.object({
  orderId: z.string().uuid(),
  discountAmount: z.number().nonnegative().max(1_000_000).optional(),
  discountNote: z.string().max(200).optional(),
})

export const addPaymentSchema = z.object({
  mode: paymentModeSchema,
  amount: z.number().positive().max(1_000_000),
  reference: z.string().max(200).optional(),
})

export type Bill = z.infer<typeof billSchema>
export type BillPayment = z.infer<typeof billPaymentSchema>
export type CreateBill = z.infer<typeof createBillSchema>
export type AddPayment = z.infer<typeof addPaymentSchema>