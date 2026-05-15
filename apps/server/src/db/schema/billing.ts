import { pgTable, uuid, integer, numeric, boolean, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { orders } from "./orders.js"

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "card", "upi", "credit"])
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "flat"])

export const discounts = pgTable("discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  type: discountTypeEnum("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  minOrderValue: numeric("min_order_value", { precision: 10, scale: 2 }).notNull().default("0"),
  maxDiscountAmount: numeric("max_discount_amount", { precision: 10, scale: 2 }),
  code: text("code"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

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
  gatewayOrderId: text("gateway_order_id"),
  gatewayStatus: text("gateway_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const billDiscounts = pgTable("bill_discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id),
  discountId: uuid("discount_id").references(() => discounts.id),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
