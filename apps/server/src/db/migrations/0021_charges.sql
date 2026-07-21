CREATE TYPE "charge_type" AS ENUM('percentage', 'flat');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
	"name" text NOT NULL,
	"type" charge_type NOT NULL,
	"value" numeric(10,2) NOT NULL,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bill_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL REFERENCES "bills"("id"),
	"charge_id" uuid REFERENCES "charges"("id"),
	"label" text NOT NULL,
	"amount" numeric(10,2) NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "charge_total" numeric(10,2) NOT NULL DEFAULT '0';
