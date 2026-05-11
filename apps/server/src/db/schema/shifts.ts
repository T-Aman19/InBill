import { pgTable, uuid, numeric, timestamp, text, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { users } from "./users.js"

export const shiftCashEntryTypeEnum = pgEnum("shift_cash_entry_type", ["in", "out"])

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  openedById: uuid("opened_by_id").notNull().references(() => users.id),
  closedById: uuid("closed_by_id").references(() => users.id),
  openingCash: numeric("opening_cash", { precision: 10, scale: 2 }).notNull(),
  closingCash: numeric("closing_cash", { precision: 10, scale: 2 }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
})

export const shiftCashEntries = pgTable("shift_cash_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  type: shiftCashEntryTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
