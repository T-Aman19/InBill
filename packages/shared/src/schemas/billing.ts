import { z } from "zod"

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
