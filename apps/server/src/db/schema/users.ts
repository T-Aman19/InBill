import { pgTable, text, uuid, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"

export const roleEnum = pgEnum("role", ["owner", "manager", "cashier", "captain", "kitchen"])

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  pin: text("pin"),
  role: roleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
