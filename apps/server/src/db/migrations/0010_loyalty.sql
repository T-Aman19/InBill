CREATE TABLE "loyalty_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
  "points_per_rupee" numeric(10, 4) NOT NULL DEFAULT '1',
  "redeem_rate" numeric(10, 4) NOT NULL DEFAULT '100',
  "min_redeem_points" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("outlet_id")
);

CREATE TABLE "customer_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "total_points" integer NOT NULL DEFAULT 0,
  "lifetime_points" integer NOT NULL DEFAULT 0,
  "tier" text NOT NULL DEFAULT 'bronze',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("outlet_id", "customer_id")
);

CREATE TABLE "point_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "delta" integer NOT NULL,
  "type" text NOT NULL,
  "bill_id" uuid REFERENCES "bills"("id"),
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
