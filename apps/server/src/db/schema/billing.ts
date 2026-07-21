import { pgTable, uuid, integer, numeric, boolean, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { orders, orderItems } from "./orders.js"
import { users } from "./users.js"

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "card", "upi", "credit"])
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "flat"])
export const chargeTypeEnum = pgEnum("charge_type", ["percentage", "flat"])

// Outlet-level charge presets (service charge, packaging charge, etc.) —
// not taxable: computed on the bill subtotal, added after GST, never part
// of the taxable base.
export const charges = pgTable("charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  type: chargeTypeEnum("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

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
  chargeTotal: numeric("charge_total", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  // Void/refund: a voided unpaid bill reopens its order; a refunded paid bill
  // reverses loyalty + inventory. Voided bills are excluded from all reports.
  isVoided: boolean("is_voided").notNull().default(false),
  voidReason: text("void_reason"),
  voidedById: uuid("voided_by_id").references(() => users.id),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id),
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

export const billCharges = pgTable("bill_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id),
  chargeId: uuid("charge_id").references(() => charges.id),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const voidedItems = pgTable("voided_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  orderItemId: uuid("order_item_id").references(() => orderItems.id),
  itemName: text("item_name").notNull(),
  qty: integer("qty").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  voidedById: uuid("voided_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
