CREATE TYPE "plan" AS ENUM('free', 'starter', 'growth', 'enterprise');
--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL UNIQUE REFERENCES "owners"("id") ON DELETE cascade,
	"plan" plan NOT NULL DEFAULT 'free',
	"status" subscription_status NOT NULL DEFAULT 'active',
	"trial_ends_at" timestamptz,
	"current_period_end" timestamptz,
	"razorpay_subscription_id" text,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"feature" text NOT NULL,
	"period" text NOT NULL,
	"count" integer NOT NULL DEFAULT 0,
	"updated_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "uq_usage_owner_feature_period" UNIQUE("owner_id","feature","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_trials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"feature" text NOT NULL,
	"started_at" timestamptz NOT NULL DEFAULT now(),
	"ends_at" timestamptz NOT NULL,
	CONSTRAINT "uq_trial_owner_feature" UNIQUE("owner_id","feature")
);
