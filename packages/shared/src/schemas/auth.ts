import { z } from "zod"

export const roleSchema = z.enum(["owner", "manager", "cashier", "captain", "kitchen", "host"])
export type Role = z.infer<typeof roleSchema>

export const loginSchema = z.object({
  pin: z.string().length(4).regex(/^\d+$/),
  outletId: z.string().uuid(),
})

export const ownerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export const tokenPayloadSchema = z.object({
  userId: z.string(),
  outletId: z.string(),
  ownerId: z.string(),
  role: roleSchema,
})

// Indian mobile number: 10 digits, starts with 6-9
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian mobile number")

export const ownerRegisterSchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  phone: phoneSchema,
})

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})

export type TokenPayload = z.infer<typeof tokenPayloadSchema>
export type OwnerRegister = z.infer<typeof ownerRegisterSchema>