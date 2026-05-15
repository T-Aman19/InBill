CREATE TYPE "public"."stock_movement_type" AS ENUM('purchase', 'sale', 'waste', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."ingredient_unit" AS ENUM('kg', 'g', 'L', 'mL', 'pcs');--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" "ingredient_unit" NOT NULL,
	"current_stock" numeric(12, 4) DEFAULT '0' NOT NULL,
	"reorder_level" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cost_per_unit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_menu_item_id_unique" UNIQUE("menu_item_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"delta" numeric(12, 4) NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"note" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;