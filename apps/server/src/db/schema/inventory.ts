import { pgTable, uuid, text, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"
import { menuItems } from "./menu.js"
import { users } from "./users.js"

export const unitEnum = pgEnum("ingredient_unit", ["kg", "g", "L", "mL", "pcs"])
export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["purchase", "sale", "waste", "adjustment"])
export const poStatusEnum = pgEnum("po_status", ["draft", "ordered", "partial", "received"])

export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  unit: unitEnum("unit").notNull(),
  currentStock: numeric("current_stock", { precision: 12, scale: 4 }).notNull().default("0"),
  reorderLevel: numeric("reorder_level", { precision: 12, scale: 4 }).notNull().default("0"),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuItemId: uuid("menu_item_id").notNull().unique().references(() => menuItems.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id").notNull().references(() => recipes.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
})

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
  status: poStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedAt: timestamp("expected_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  orderedQty: numeric("ordered_qty", { precision: 12, scale: 4 }).notNull(),
  receivedQty: numeric("received_qty", { precision: 12, scale: 4 }).notNull().default("0"),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
})

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  type: stockMovementTypeEnum("type").notNull(),
  delta: numeric("delta", { precision: 12, scale: 4 }).notNull(),
  referenceId: uuid("reference_id"),
  referenceType: text("reference_type"),
  note: text("note"),
  recordedById: uuid("recorded_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
