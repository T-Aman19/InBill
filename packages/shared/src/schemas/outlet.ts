import { z } from "zod"

export const ownerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  createdAt: z.string().datetime(),
})

export const outletSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().min(10),
  gstin: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
  currency: z.string().default("INR"),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
})

export const createOutletSchema = outletSchema.omit({ id: true, createdAt: true })

export const updateOutletSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  timezone: z.string().optional(),
  upiVpa: z.string().optional(),
  razorpayKeyId: z.string().optional(),
  razorpayKeySecret: z.string().optional(),
})

export type Owner = z.infer<typeof ownerSchema>
export type Outlet = z.infer<typeof outletSchema>
export type CreateOutlet = z.infer<typeof createOutletSchema>
export type UpdateOutlet = z.infer<typeof updateOutletSchema>
