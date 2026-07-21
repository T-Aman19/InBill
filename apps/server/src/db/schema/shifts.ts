import { pgTable, uuid, numeric, timestamp, text, pgEnum, jsonb, unique } from "drizzle-orm/pg-core"
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

// End-of-day settlement. One row per business date once the day is closed;
// bills on a closed date are locked against voids/refunds/discount edits.
// `summary` snapshots the Z-report numbers at close time so the report never
// drifts even if underlying data is later corrected by a migration.
export const dayCloses = pgTable("day_closes", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  businessDate: text("business_date").notNull(), // YYYY-MM-DD in the outlet's timezone
  closedById: uuid("closed_by_id").references(() => users.id),
  expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  countedCash: numeric("counted_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  summary: jsonb("summary").notNull().default("{}"),
  note: text("note"),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("day_closes_outlet_date_unique").on(t.outletId, t.businessDate)])

export const shiftCashEntries = pgTable("shift_cash_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  type: shiftCashEntryTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
