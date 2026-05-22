CREATE TABLE "voided_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("id"),
  "order_id" uuid NOT NULL REFERENCES "orders"("id"),
  "order_item_id" uuid REFERENCES "order_items"("id"),
  "item_name" text NOT NULL,
  "qty" integer NOT NULL DEFAULT 1,
  "unit_price" numeric(10, 2) NOT NULL DEFAULT '0',
  "voided_by_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "bills" ADD COLUMN "created_by_id" uuid REFERENCES "users"("id");
