ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "customer_id" uuid REFERENCES "customers"("id");
