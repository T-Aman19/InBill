import { z } from "zod"

export const roleSchema = z.enum(["owner", "manager", "cashier", "captain", "kitchen"])
export type Role = z.infer<typeof roleSchema>

export const loginSchema = z.object({
  pin: z.string().length(4).regex(/^\d+$/),
  outletId: z.string().uuid(),
})

export const ownerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const tokenPayloadSchema = z.object({
  userId: z.string().uuid(),
  outletId: z.string().uuid(),
  ownerId: z.string().uuid(),
  role: roleSchema,
})

export type TokenPayload = z.infer<typeof tokenPayloadSchema>
