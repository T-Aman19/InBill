CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"token_endpoint_auth_method" text NOT NULL DEFAULT 'none',
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE cascade,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"outlet_ids" jsonb,
	"expires_at" timestamptz NOT NULL,
	"used_at" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_codes_hash" ON "oauth_authorization_codes" ("code_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE cascade,
	"outlet_ids" jsonb,
	"expires_at" timestamptz NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_access_tokens_hash" ON "oauth_access_tokens" ("token_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE cascade,
	"client_id" text NOT NULL REFERENCES "oauth_clients"("id") ON DELETE cascade,
	"outlet_ids" jsonb,
	"expires_at" timestamptz NOT NULL,
	"revoked_at" timestamptz,
	"replaced_by_hash" text,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_refresh_tokens_hash" ON "oauth_refresh_tokens" ("token_hash");
