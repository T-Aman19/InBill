import { z } from "zod"

export const shiftSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  openedById: z.string().uuid(),
  closedById: z.string().uuid().nullable().default(null),
  openingCash: z.number().nonnegative(),
  closingCash: z.number().nonnegative().nullable().default(null),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable().default(null),
})

export const openShiftSchema = z.object({ openingCash: z.number().nonnegative() })
export const closeShiftSchema = z.object({ closingCash: z.number().nonnegative() })

export type Shift = z.infer<typeof shiftSchema>
