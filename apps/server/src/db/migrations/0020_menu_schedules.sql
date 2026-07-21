CREATE TABLE IF NOT EXISTS "menu_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
	"name" text NOT NULL,
	"days" jsonb NOT NULL DEFAULT '[]',
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"percent_off" numeric(5,2) NOT NULL DEFAULT '0',
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "schedule_id" uuid REFERENCES "menu_schedules"("id");
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "schedule_id" uuid REFERENCES "menu_schedules"("id");
