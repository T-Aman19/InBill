import { pgTable, uuid, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"

export const syncOperationEnum = pgEnum("sync_operation", ["insert", "update", "delete"])

// Outbox table — every write gets an event here, a worker drains it to cloud
export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  operation: syncOperationEnum("operation").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
})
