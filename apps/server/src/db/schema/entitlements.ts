import { pgTable, uuid, text, integer, timestamp, pgEnum, unique } from "drizzle-orm/pg-core"
import { owners } from "./owners.js"

export const planEnum = pgEnum("plan", ["free", "starter", "growth", "enterprise"])
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"])

// One subscription per owner (the billing account). Absent row ⇒ treated as "free".
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }).unique(),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Monthly usage tallies for metered features. `period` is 'YYYY-MM' in app tz.
export const usageCounters = pgTable("usage_counters", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  period: text("period").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uq_usage_owner_feature_period").on(t.ownerId, t.feature, t.period)])

// Per-feature free trials. Clock starts on first activation, not signup.
export const featureTrials = pgTable("feature_trials", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, (t) => [unique("uq_trial_owner_feature").on(t.ownerId, t.feature)])
