import { z } from "zod"
import { phoneSchema } from "./auth.js"

// Indian GSTIN: 15-character alphanumeric with specific structure
export const gstinSchema = z
  .string()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    "GSTIN must be a valid 15-character Indian GST number",
  )

// FSSAI licence number: exactly 14 digits
export const fssaiSchema = z
  .string()
  .regex(/^\d{14}$/, "FSSAI number must be exactly 14 digits")

// UPI VPA format: username@bankcode
export const upiVpaSchema = z
  .string()
  .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, "UPI VPA must be in format username@bankcode")

export const ownerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: phoneSchema,
  createdAt: z.string().datetime(),
})

export const outletSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(500),
  phone: phoneSchema,
  gstin: gstinSchema.optional(),
  timezone: z.string().default("Asia/Kolkata"),
  currency: z.string().default("INR"),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
})

export const createOutletSchema = outletSchema.omit({ id: true, createdAt: true, ownerId: true })

export const outletSettingsSchema = z.object({
  deliveryEnabled: z.boolean().optional(),
})

export const updateOutletSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional(),
  phone: phoneSchema.optional(),
  gstin: gstinSchema.optional().or(z.literal("")),
  fssaiNumber: fssaiSchema.optional().or(z.literal("")),
  timezone: z.string().optional(),
  upiVpa: upiVpaSchema.optional().or(z.literal("")),
  razorpayKeyId: z.string().max(100).optional(),
  razorpayKeySecret: z.string().max(100).optional(),
  settings: outletSettingsSchema.optional(),
})

export type OutletSettings = z.infer<typeof outletSettingsSchema>

export type Owner = z.infer<typeof ownerSchema>
export type Outlet = z.infer<typeof outletSchema>
export type CreateOutlet = z.infer<typeof createOutletSchema>
export type UpdateOutlet = z.infer<typeof updateOutletSchema>