ALTER TABLE "queue_entries" ADD COLUMN "customer_id" uuid REFERENCES "public"."customers"("id");
