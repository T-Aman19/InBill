CREATE TABLE IF NOT EXISTS "day_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
	"business_date" text NOT NULL,
	"closed_by_id" uuid REFERENCES "users"("id"),
	"expected_cash" numeric(12,2) NOT NULL DEFAULT '0',
	"counted_cash" numeric(12,2) NOT NULL DEFAULT '0',
	"summary" jsonb NOT NULL DEFAULT '{}',
	"note" text,
	"closed_at" timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT "day_closes_outlet_date_unique" UNIQUE ("outlet_id", "business_date")
);
