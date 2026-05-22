CREATE TYPE "order_source" AS ENUM('pos', 'qr', 'waiter_app', 'zomato', 'swiggy', 'ondc');
ALTER TABLE "orders" ADD COLUMN "source" "order_source" NOT NULL DEFAULT 'pos';
