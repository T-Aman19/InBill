CREATE TABLE IF NOT EXISTS "subscription_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"plan" plan NOT NULL,
	"status" subscription_status NOT NULL,
	"cycle" text,
	"current_period_end" timestamptz,
	"cancel_at_period_end" boolean NOT NULL DEFAULT false,
	"razorpay_customer_id" text,
	"razorpay_subscription_id" text,
	"replaced_at" timestamptz NOT NULL DEFAULT now()
);
