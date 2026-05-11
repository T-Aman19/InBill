CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'flat');--> statement-breakpoint
CREATE TABLE "bill_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"discount_id" uuid,
	"label" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "discount_type" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"min_order_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_discount_amount" numeric(10, 2),
	"code" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "bill_discounts" ADD CONSTRAINT "bill_discounts_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_discounts" ADD CONSTRAINT "bill_discounts_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;