import { z } from "zod"

export const queueStatusSchema = z.enum(["waiting", "seated", "cancelled", "no_show"])
export type QueueStatus = z.infer<typeof queueStatusSchema>

export const reservationStatusSchema = z.enum(["pending", "confirmed", "seated", "no_show", "cancelled"])
export type ReservationStatus = z.infer<typeof reservationStatusSchema>

export const queueEntrySchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  customerName: z.string().min(1),
  customerPhone: z.string().nullable(),
  partySize: z.number().int().min(1),
  token: z.string(),
  status: queueStatusSchema,
  tableId: z.string().uuid().nullable(),
  joinedAt: z.string(),
  seatedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
})

export const createQueueEntrySchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().nullable().optional(),
  partySize: z.number().int().min(1).max(50),
})

export const seatQueueEntrySchema = z.object({
  tableId: z.string().uuid(),
})

export const cancelQueueEntrySchema = z.object({
  status: z.enum(["cancelled", "no_show"]),
})

export const reservationSchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  customerName: z.string().min(1),
  customerPhone: z.string().nullable(),
  partySize: z.number().int().min(1),
  reservedFor: z.string(),
  tableId: z.string().uuid().nullable(),
  status: reservationStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export const createReservationSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().nullable().optional(),
  partySize: z.number().int().min(1).max(50),
  reservedFor: z.string(),
  tableId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const updateReservationSchema = createReservationSchema.partial().extend({
  status: reservationStatusSchema.optional(),
})

export type QueueEntry = z.infer<typeof queueEntrySchema>
export type Reservation = z.infer<typeof reservationSchema>
