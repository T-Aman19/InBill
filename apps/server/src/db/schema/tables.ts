import { pgTable, text, uuid, integer, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"

export const tableStatusEnum = pgEnum("table_status", ["available", "occupied", "reserved", "billed"])

export const floors = pgTable("floors", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const tables = pgTable("tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  floorId: uuid("floor_id").notNull().references(() => floors.id),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: tableStatusEnum("status").notNull().default("available"),
  currentOrderId: uuid("current_order_id"),
})
