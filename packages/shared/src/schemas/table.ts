import { z } from "zod"

export const tableStatusSchema = z.enum(["available", "occupied", "reserved", "billed"])
export type TableStatus = z.infer<typeof tableStatusSchema>

export const floorSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
})

export const tableSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  floorId: z.string().uuid(),
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  status: tableStatusSchema.default("available"),
  currentOrderId: z.string().uuid().nullable().default(null),
})

export const createTableSchema = tableSchema.omit({ id: true, outletId: true, status: true, currentOrderId: true })
export const updateTableSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  floorId: z.string().uuid().optional(),
})

export const createFloorSchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) })
export const updateFloorSchema = createFloorSchema.partial()

export type Floor = z.infer<typeof floorSchema>
export type Table = z.infer<typeof tableSchema>
