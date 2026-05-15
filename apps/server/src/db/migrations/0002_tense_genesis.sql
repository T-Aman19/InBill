ALTER TABLE "outlets" ADD COLUMN "upi_vpa" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "razorpay_key_id" text;--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN "razorpay_key_secret" text;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD COLUMN "gateway_order_id" text;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD COLUMN "gateway_status" text;