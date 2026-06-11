import { z } from "zod"

export const queueStatusSchema = z.enum(["waiting", "seated", "cancelled", "no_show"])
export type QueueStatus = z.infer<typeof queueStatusSchema>

export const reservationStatusSchema = z.enum(["pending", "confirmed", "seated", "no_show", "cancelled"])
export type ReservationStatus = z.infer<typeof reservationStatusSchema>

// Indian mobile: 10 digits starting with 6-9, or null
const optionalPhoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian mobile number")
  .nullable()
  .optional()

export const queueEntrySchema = z.object({
  id: z.string().uuid(),
  outletId: z.string().uuid(),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().nullable(),
  partySize: z.number().int().min(1).max(50),
  token: z.string(),
  status: queueStatusSchema,
  tableId: z.string().uuid().nullable(),
  joinedAt: z.string(),
  seatedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
})

export const createQueueEntrySchema = z.object({
  customerName: z.string().min(1).max(100).transform((s) => s.trim()),
  customerPhone: optionalPhoneSchema,
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
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().nullable(),
  partySize: z.number().int().min(1).max(50),
  reservedFor: z.string(),
  tableId: z.string().uuid().nullable(),
  status: reservationStatusSchema,
  notes: z.string().max(500).nullable(),
  createdAt: z.string(),
})

export const createReservationSchema = z
  .object({
    customerName: z.string().min(1).max(100).transform((s) => s.trim()),
    customerPhone: optionalPhoneSchema,
    partySize: z.number().int().min(1).max(50),
    reservedFor: z.string().datetime({ message: "reservedFor must be a valid ISO datetime" }),
    tableId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (d) => new Date(d.reservedFor) > new Date(),
    { message: "Reservation must be in the future", path: ["reservedFor"] },
  )

export const updateReservationSchema = z
  .object({
    customerName: z.string().min(1).max(100).optional(),
    customerPhone: optionalPhoneSchema,
    partySize: z.number().int().min(1).max(50).optional(),
    reservedFor: z.string().datetime().optional(),
    tableId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    status: reservationStatusSchema.optional(),
  })
  .refine(
    (d) => {
      if (!d.reservedFor) return true
      return new Date(d.reservedFor) > new Date()
    },
    { message: "Reservation must be in the future", path: ["reservedFor"] },
  )

export type QueueEntry = z.infer<typeof queueEntrySchema>
export type Reservation = z.infer<typeof reservationSchema>