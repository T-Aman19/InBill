CREATE TABLE IF NOT EXISTS "mcp_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"outlet_id" uuid REFERENCES "outlets"("id") ON DELETE cascade,
	"label" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamptz,
	"revoked_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mcp_api_keys_hash" ON "mcp_api_keys" ("key_hash");
