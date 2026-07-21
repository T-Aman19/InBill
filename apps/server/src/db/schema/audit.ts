import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { users } from "./users.js"

// Append-only log of sensitive actions (voids, refunds, discounts, price
// changes, cash movements, …). Rows are never updated or deleted by the app —
// the log's value depends on it being tamper-evident.
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  userId: uuid("user_id").references(() => users.id),
  // Name snapshot so the log stays readable after staff are renamed/removed
  userName: text("user_name"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
