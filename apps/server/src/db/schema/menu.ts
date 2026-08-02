import { pgTable, text, uuid, timestamp, boolean, integer, numeric, jsonb } from "drizzle-orm/pg-core"
import { outlets } from "./owners.js"

// Time windows that gate when items/categories are orderable ("Breakfast",
// "Happy Hour"). `days` is a JSON array of weekday numbers 0–6 (0 = Sunday);
// empty = every day. Windows may wrap midnight (endTime < startTime).
// `percentOff` > 0 turns the window into a happy-hour price cut for its items.
export const menuSchedules = pgTable("menu_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  days: jsonb("days").notNull().default("[]"),
  startTime: text("start_time").notNull(), // "HH:MM" outlet-local
  endTime: text("end_time").notNull(),     // "HH:MM" outlet-local
  percentOff: numeric("percent_off", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const taxConfigs = pgTable("tax_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  igstRate: numeric("igst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
})

// Kitchen stations route dishes to the right part of the line (Tandoor, Curries,
// Bar…). A station is assigned per category (the default) and can be overridden
// per item; firing an order splits it into one KOT per station.
export const stations = pgTable("stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#f97316"), // KDS tab/card accent
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  scheduleId: uuid("schedule_id").references(() => menuSchedules.id),
  stationId: uuid("station_id").references(() => stations.id), // default kitchen station for items in this category
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
})

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  taxConfigId: uuid("tax_config_id").references(() => taxConfigs.id),
  scheduleId: uuid("schedule_id").references(() => menuSchedules.id),
  stationId: uuid("station_id").references(() => stations.id), // overrides the category's station when set
  name: text("name").notNull(),
  description: text("description"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  isVeg: boolean("is_veg").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true),
  hsnCode: text("hsn_code"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const itemVariants = pgTable("item_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
})

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(false),
  multiSelect: boolean("multi_select").notNull().default(false),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select"),
})

export const modifiers = pgTable("modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => modifierGroups.id),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
})

export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  itemId: uuid("item_id").notNull().references(() => menuItems.id),
  groupId: uuid("group_id").notNull().references(() => modifierGroups.id),
})
