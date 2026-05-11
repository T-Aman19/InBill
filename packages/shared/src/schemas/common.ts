import { z } from "zod"

export const uuidSchema = z.string().uuid()
export const timestampSchema = z.string().datetime()

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

export const dateRangeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
})
