import { pgTable, text, uuid, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core"
import { numeric } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { tables } from "./tables.js"
import { users } from "./users.js"

export const orderTypeEnum = pgEnum("order_type", ["dine_in", "takeaway", "delivery"])
export const orderStatusEnum = pgEnum("order_status", ["open", "kot_sent", "served", "billed", "cancelled"])
export const kotStatusEnum = pgEnum("kot_status", ["pending", "acknowledged", "done"])
export const orderSourceEnum = pgEnum("order_source", ["pos", "qr", "waiter_app", "zomato", "swiggy", "ondc"])

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name"),
  phone: text("phone").notNull(),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  tableId: uuid("table_id").references(() => tables.id),
  customerId: uuid("customer_id").references(() => customers.id),
  serverId: uuid("server_id").references(() => users.id),
  type: orderTypeEnum("type").notNull(),
  source: orderSourceEnum("source").notNull().default("pos"),
  status: orderStatusEnum("status").notNull().default("open"),
  guestCount: integer("guest_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  kotId: uuid("kot_id"),
  menuItemId: uuid("menu_item_id").notNull(),
  variantId: uuid("variant_id"),
  // snapshot prices at time of order — never rely on live menu prices
  name: text("name").notNull(),
  variantName: text("variant_name"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  isVoided: boolean("is_voided").notNull().default(false),
})

export const orderItemModifiers = pgTable("order_item_modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  modifierId: uuid("modifier_id").notNull(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
})

export const kots = pgTable("kots", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  kotNumber: integer("kot_number").notNull(),
  status: kotStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
