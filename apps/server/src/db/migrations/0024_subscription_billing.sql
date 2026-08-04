ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cycle" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "razorpay_customer_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamptz NOT NULL DEFAULT now()
);
