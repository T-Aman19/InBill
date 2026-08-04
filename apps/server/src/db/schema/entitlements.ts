import { pgTable, uuid, text, integer, timestamp, pgEnum, unique, boolean } from "drizzle-orm/pg-core"
import { owners } from "./owners.js"

export const planEnum = pgEnum("plan", ["free", "starter", "growth", "enterprise"])
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"])

// One subscription per owner (the billing account). Absent row ⇒ treated as "free".
// `plan` is only honoured while `status` is active/trialing (see lib/entitlements
// loadContext); past_due/canceled fall back to free. So a row can safely carry the
// intended plan before the first Razorpay charge lands, as long as status isn't active.
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }).unique(),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  // "monthly" | "annual" — null on free/never-subscribed rows.
  cycle: text("cycle"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Set when the owner cancels but keeps access until the paid period ends.
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  razorpayCustomerId: text("razorpay_customer_id"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Snapshot of a subscriptions row taken right before /subscribe overwrites it
// (subscriptions.ownerId is unique — there's only ever one live row per owner).
// Without this, resubscribing after a cancel silently loses the trail back to
// the previous Razorpay subscription id. Insert-only, never updated.
export const subscriptionHistory = pgTable("subscription_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  cycle: text("cycle"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  razorpayCustomerId: text("razorpay_customer_id"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  replacedAt: timestamp("replaced_at", { withTimezone: true }).notNull().defaultNow(),
})

// Idempotency ledger for Razorpay webhooks — Razorpay retries delivery, so every
// event id is recorded here and re-deliveries are ignored. PK is Razorpay's
// x-razorpay-event-id header.
export const billingWebhookEvents = pgTable("billing_webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
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
