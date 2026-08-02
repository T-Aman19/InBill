CREATE TABLE IF NOT EXISTS "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
	"name" text NOT NULL,
	"color" text NOT NULL DEFAULT '#f97316',
	"sort_order" integer NOT NULL DEFAULT 0,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "station_id" uuid REFERENCES "stations"("id");
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "station_id" uuid REFERENCES "stations"("id");
--> statement-breakpoint
ALTER TABLE "kots" ADD COLUMN IF NOT EXISTS "station_id" uuid REFERENCES "stations"("id");
