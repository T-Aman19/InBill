import { relations } from "drizzle-orm"
import { owners, outlets } from "./owners.js"
import { users } from "./users.js"
import { categories, menuItems, itemVariants, modifierGroups, modifiers, menuItemModifierGroups, taxConfigs } from "./menu.js"
import { floors, tables } from "./tables.js"
import { orders, orderItems, orderItemModifiers, kots, customers } from "./orders.js"
import { bills, billPayments, billDiscounts, discounts } from "./billing.js"
import { shifts, shiftCashEntries } from "./shifts.js"
import { ingredients, recipes, recipeIngredients, stockMovements, vendors, purchaseOrders, purchaseOrderItems } from "./inventory.js"

export const ownersRelations = relations(owners, ({ many }) => ({
  outlets: many(outlets),
}))

export const outletsRelations = relations(outlets, ({ one, many }) => ({
  owner: one(owners, { fields: [outlets.ownerId], references: [owners.id] }),
  users: many(users),
  categories: many(categories),
  menuItems: many(menuItems),
  modifierGroups: many(modifierGroups),
  taxConfigs: many(taxConfigs),
  floors: many(floors),
  tables: many(tables),
  orders: many(orders),
  bills: many(bills),
  shifts: many(shifts),
  discounts: many(discounts),
  ingredients: many(ingredients),
  stockMovements: many(stockMovements),
  vendors: many(vendors),
  purchaseOrders: many(purchaseOrders),
}))

export const usersRelations = relations(users, ({ one }) => ({
  outlet: one(outlets, { fields: [users.outletId], references: [outlets.id] }),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  outlet: one(outlets, { fields: [categories.outletId], references: [outlets.id] }),
  items: many(menuItems),
}))

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  outlet: one(outlets, { fields: [menuItems.outletId], references: [outlets.id] }),
  category: one(categories, { fields: [menuItems.categoryId], references: [categories.id] }),
  taxConfig: one(taxConfigs, { fields: [menuItems.taxConfigId], references: [taxConfigs.id] }),
  variants: many(itemVariants),
  modifierGroups: many(menuItemModifierGroups),
  recipe: one(recipes, { fields: [menuItems.id], references: [recipes.menuItemId] }),
}))

export const itemVariantsRelations = relations(itemVariants, ({ one }) => ({
  item: one(menuItems, { fields: [itemVariants.itemId], references: [menuItems.id] }),
}))

export const modifierGroupsRelations = relations(modifierGroups, ({ one, many }) => ({
  outlet: one(outlets, { fields: [modifierGroups.outletId], references: [outlets.id] }),
  modifiers: many(modifiers),
  items: many(menuItemModifierGroups),
}))

export const modifiersRelations = relations(modifiers, ({ one }) => ({
  group: one(modifierGroups, { fields: [modifiers.groupId], references: [modifierGroups.id] }),
}))

export const menuItemModifierGroupsRelations = relations(menuItemModifierGroups, ({ one }) => ({
  item: one(menuItems, { fields: [menuItemModifierGroups.itemId], references: [menuItems.id] }),
  group: one(modifierGroups, { fields: [menuItemModifierGroups.groupId], references: [modifierGroups.id] }),
}))

export const floorsRelations = relations(floors, ({ one, many }) => ({
  outlet: one(outlets, { fields: [floors.outletId], references: [outlets.id] }),
  tables: many(tables),
}))

export const tablesRelations = relations(tables, ({ one }) => ({
  outlet: one(outlets, { fields: [tables.outletId], references: [outlets.id] }),
  floor: one(floors, { fields: [tables.floorId], references: [floors.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  outlet: one(outlets, { fields: [orders.outletId], references: [outlets.id] }),
  table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  server: one(users, { fields: [orders.serverId], references: [users.id] }),
  items: many(orderItems),
  kots: many(kots),
}))

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  modifiers: many(orderItemModifiers),
}))

export const orderItemModifiersRelations = relations(orderItemModifiers, ({ one }) => ({
  orderItem: one(orderItems, { fields: [orderItemModifiers.orderItemId], references: [orderItems.id] }),
}))

export const kotsRelations = relations(kots, ({ one, many }) => ({
  outlet: one(outlets, { fields: [kots.outletId], references: [outlets.id] }),
  order: one(orders, { fields: [kots.orderId], references: [orders.id] }),
  items: many(orderItems, { relationName: "kot_items" }),
}))

export const billsRelations = relations(bills, ({ one, many }) => ({
  outlet: one(outlets, { fields: [bills.outletId], references: [outlets.id] }),
  order: one(orders, { fields: [bills.orderId], references: [orders.id] }),
  payments: many(billPayments),
  discountLines: many(billDiscounts),
}))

export const billPaymentsRelations = relations(billPayments, ({ one }) => ({
  bill: one(bills, { fields: [billPayments.billId], references: [bills.id] }),
}))

export const discountsRelations = relations(discounts, ({ one, many }) => ({
  outlet: one(outlets, { fields: [discounts.outletId], references: [outlets.id] }),
  billLines: many(billDiscounts),
}))

export const billDiscountsRelations = relations(billDiscounts, ({ one }) => ({
  bill: one(bills, { fields: [billDiscounts.billId], references: [bills.id] }),
  discount: one(discounts, { fields: [billDiscounts.discountId], references: [discounts.id] }),
}))

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  outlet: one(outlets, { fields: [shifts.outletId], references: [outlets.id] }),
  openedBy: one(users, { fields: [shifts.openedById], references: [users.id] }),
  closedBy: one(users, { fields: [shifts.closedById], references: [users.id] }),
  cashEntries: many(shiftCashEntries),
}))

export const shiftCashEntriesRelations = relations(shiftCashEntries, ({ one }) => ({
  shift: one(shifts, { fields: [shiftCashEntries.shiftId], references: [shifts.id] }),
}))

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  outlet: one(outlets, { fields: [ingredients.outletId], references: [outlets.id] }),
  recipeIngredients: many(recipeIngredients),
  stockMovements: many(stockMovements),
}))

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  menuItem: one(menuItems, { fields: [recipes.menuItemId], references: [menuItems.id] }),
  recipeIngredients: many(recipeIngredients),
}))

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] }),
}))

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  outlet: one(outlets, { fields: [stockMovements.outletId], references: [outlets.id] }),
  ingredient: one(ingredients, { fields: [stockMovements.ingredientId], references: [ingredients.id] }),
  recordedBy: one(users, { fields: [stockMovements.recordedById], references: [users.id] }),
}))

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  outlet: one(outlets, { fields: [vendors.outletId], references: [outlets.id] }),
  purchaseOrders: many(purchaseOrders),
}))

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  outlet: one(outlets, { fields: [purchaseOrders.outletId], references: [outlets.id] }),
  vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
  createdBy: one(users, { fields: [purchaseOrders.createdById], references: [users.id] }),
  items: many(purchaseOrderItems),
}))

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
  ingredient: one(ingredients, { fields: [purchaseOrderItems.ingredientId], references: [ingredients.id] }),
}))
