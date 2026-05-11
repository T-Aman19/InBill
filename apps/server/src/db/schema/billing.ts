import { pgTable, uuid, integer, numeric, boolean, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { orders } from "./orders.js"

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "card", "upi", "credit"])

export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  billNumber: integer("bill_number").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  // tax_lines stored as [{name, rate, amount}] — avoids join for reporting
  taxLines: jsonb("tax_lines").notNull().default("[]"),
  taxTotal: numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  discountNote: text("discount_note"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const billPayments = pgTable("bill_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id),
  mode: paymentModeEnum("mode").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
