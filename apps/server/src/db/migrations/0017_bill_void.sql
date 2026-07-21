ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "is_voided" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "void_reason" text;
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "voided_by_id" uuid REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "voided_at" timestamptz;
