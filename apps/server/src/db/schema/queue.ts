import { pgTable, text, uuid, integer, pgEnum, timestamp } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { tables } from "./tables.js"

export const queueStatusEnum = pgEnum("queue_status", ["waiting", "seated", "cancelled", "no_show"])
export const reservationStatusEnum = pgEnum("reservation_status", ["pending", "confirmed", "seated", "no_show", "cancelled"])

export const queueEntries = pgTable("queue_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  partySize: integer("party_size").notNull(),
  token: text("token").notNull(),
  status: queueStatusEnum("status").notNull().default("waiting"),
  tableId: uuid("table_id").references(() => tables.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  seatedAt: timestamp("seated_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
})

export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  partySize: integer("party_size").notNull(),
  reservedFor: timestamp("reserved_for", { withTimezone: true }).notNull(),
  tableId: uuid("table_id").references(() => tables.id),
  status: reservationStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})