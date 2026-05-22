import { pgTable, uuid, integer, numeric, boolean, text, timestamp } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { customers } from "./orders.js"
import { bills } from "./billing.js"

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id).unique(),
  pointsPerRupee: numeric("points_per_rupee", { precision: 10, scale: 4 }).notNull().default("1"),
  redeemRate: numeric("redeem_rate", { precision: 10, scale: 4 }).notNull().default("100"),
  minRedeemPoints: integer("min_redeem_points").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const customerPoints = pgTable("customer_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  totalPoints: integer("total_points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: text("tier").notNull().default("bronze"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const pointTransactions = pgTable("point_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  delta: integer("delta").notNull(),
  type: text("type").notNull(),
  billId: uuid("bill_id").references(() => bills.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
