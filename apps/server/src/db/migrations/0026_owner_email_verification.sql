ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Grandfather existing accounts in — this requirement only applies going
-- forward, from the migration date. Owners registered before it (all rows
-- that existed at ALTER-time) should not suddenly lose outlet-creation access.
UPDATE "owners" SET "email_verified" = true WHERE "created_at" < now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "owner_email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
	"token_hash" text NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"used_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oev_token_hash" ON "owner_email_verifications" ("token_hash");
