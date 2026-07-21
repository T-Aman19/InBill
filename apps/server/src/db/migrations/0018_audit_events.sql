CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
	"user_id" uuid REFERENCES "users"("id"),
	"user_name" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb NOT NULL DEFAULT '{}',
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_outlet_created_idx" ON "audit_events" ("outlet_id", "created_at");
