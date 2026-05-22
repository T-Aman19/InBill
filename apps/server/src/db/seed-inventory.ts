/**
 * Inventory seed — adds sample ingredients and recipes for the demo outlet.
 * Run: bun run src/db/seed-inventory.ts
 * Requires: base seed already run (owner + outlet + menu items must exist)
 */
import { db } from "./index.js"
import { outlets, menuItems, ingredients, recipes, recipeIngredients } from "./schema/index.js"
import { eq } from "drizzle-orm"

console.log("Seeding inventory...")

// Find the demo outlet
const outlet = await db.query.outlets.findFirst({
  where: eq(outlets.name, "InBill Demo Restaurant"),
})
if (!outlet) {
  console.error("Demo outlet not found — run seed.ts first")
  process.exit(1)
}
console.log("Using outlet:", outlet.name)

// ── Ingredients ───────────────────────────────────────────────────────────────
const ingredientDefs = [
  { name: "Paneer",           unit: "kg"  as const, currentStock: "5",    reorderLevel: "1",   costPerUnit: "320" },
  { name: "Chicken",          unit: "kg"  as const, currentStock: "8",    reorderLevel: "2",   costPerUnit: "220" },
  { name: "Basmati Rice",     unit: "kg"  as const, currentStock: "15",   reorderLevel: "3",   costPerUnit: "90"  },
  { name: "Whole Urad Dal",   unit: "kg"  as const, currentStock: "6",    reorderLevel: "1.5", costPerUnit: "110" },
  { name: "Tomatoes",         unit: "kg"  as const, currentStock: "10",   reorderLevel: "2",   costPerUnit: "40"  },
  { name: "Onions",           unit: "kg"  as const, currentStock: "12",   reorderLevel: "3",   costPerUnit: "30"  },
  { name: "Capsicum",         unit: "kg"  as const, currentStock: "4",    reorderLevel: "1",   costPerUnit: "60"  },
  { name: "Mixed Vegetables", unit: "kg"  as const, currentStock: "6",    reorderLevel: "2",   costPerUnit: "55"  },
  { name: "Curd / Yogurt",    unit: "kg"  as const, currentStock: "5",    reorderLevel: "1",   costPerUnit: "60"  },
  { name: "Butter",           unit: "kg"  as const, currentStock: "3",    reorderLevel: "0.5", costPerUnit: "480" },
  { name: "Fresh Cream",      unit: "mL"  as const, currentStock: "2000", reorderLevel: "500", costPerUnit: "0.6" },
  { name: "Milk",             unit: "mL"  as const, currentStock: "5000", reorderLevel: "1000",costPerUnit: "0.07"},
  { name: "Mango Pulp",       unit: "mL"  as const, currentStock: "3000", reorderLevel: "500", costPerUnit: "0.2" },
  { name: "Coffee Powder",    unit: "g"   as const, currentStock: "500",  reorderLevel: "100", costPerUnit: "1.2" },
  { name: "Cooking Oil",      unit: "mL"  as const, currentStock: "8000", reorderLevel: "1000",costPerUnit: "0.15"},
  { name: "Spice Mix",        unit: "g"   as const, currentStock: "2000", reorderLevel: "200", costPerUnit: "0.8" },
  { name: "Ginger-Garlic Paste", unit: "g" as const, currentStock: "1500",reorderLevel: "200", costPerUnit: "0.5" },
]

const insertedIngredients = await db
  .insert(ingredients)
  .values(ingredientDefs.map((i) => ({ outletId: outlet.id, ...i })))
  .returning()

const byName = Object.fromEntries(insertedIngredients.map((i) => [i.name, i]))
console.log(`Ingredients: ${insertedIngredients.length} added`)

// ── Fetch menu items ──────────────────────────────────────────────────────────
const items = await db.query.menuItems.findMany({
  where: eq(menuItems.outletId, outlet.id),
})
const menuByName = Object.fromEntries(items.map((m) => [m.name, m]))

// ── Recipes ───────────────────────────────────────────────────────────────────
type RecipeDef = {
  menuItemName: string
  note: string
  ingredients: { name: string; qty: number }[]
}

const recipeDefs: RecipeDef[] = [
  {
    menuItemName: "Paneer Tikka",
    note: "Marinated & grilled — per serving",
    ingredients: [
      { name: "Paneer",              qty: 0.2   },  // 200 g
      { name: "Curd / Yogurt",       qty: 0.05  },  // 50 g
      { name: "Capsicum",            qty: 0.05  },  // 50 g
      { name: "Ginger-Garlic Paste", qty: 15    },  // 15 g
      { name: "Spice Mix",           qty: 12    },  // 12 g
      { name: "Cooking Oil",         qty: 20    },  // 20 mL
    ],
  },
  {
    menuItemName: "Chicken 65",
    note: "Deep fried starter — per serving",
    ingredients: [
      { name: "Chicken",             qty: 0.25  },  // 250 g
      { name: "Curd / Yogurt",       qty: 0.03  },  // 30 g
      { name: "Ginger-Garlic Paste", qty: 20    },  // 20 g
      { name: "Spice Mix",           qty: 15    },  // 15 g
      { name: "Cooking Oil",         qty: 80    },  // 80 mL (deep fry)
    ],
  },
  {
    menuItemName: "Dal Makhani",
    note: "Slow cooked overnight dal — per serving",
    ingredients: [
      { name: "Whole Urad Dal",      qty: 0.1   },  // 100 g
      { name: "Tomatoes",            qty: 0.1   },  // 100 g
      { name: "Onions",              qty: 0.06  },  // 60 g
      { name: "Butter",              qty: 0.03  },  // 30 g
      { name: "Fresh Cream",         qty: 50    },  // 50 mL
      { name: "Ginger-Garlic Paste", qty: 10    },  // 10 g
      { name: "Spice Mix",           qty: 8     },  // 8 g
    ],
  },
  {
    menuItemName: "Butter Chicken",
    note: "Makhani gravy — per serving",
    ingredients: [
      { name: "Chicken",             qty: 0.25  },  // 250 g
      { name: "Tomatoes",            qty: 0.15  },  // 150 g
      { name: "Onions",              qty: 0.08  },  // 80 g
      { name: "Butter",              qty: 0.04  },  // 40 g
      { name: "Fresh Cream",         qty: 80    },  // 80 mL
      { name: "Ginger-Garlic Paste", qty: 15    },  // 15 g
      { name: "Spice Mix",           qty: 15    },  // 15 g
    ],
  },
  {
    menuItemName: "Veg Biryani",
    note: "Dum-style biryani — per serving",
    ingredients: [
      { name: "Basmati Rice",        qty: 0.2   },  // 200 g
      { name: "Mixed Vegetables",    qty: 0.15  },  // 150 g
      { name: "Onions",              qty: 0.07  },  // 70 g
      { name: "Curd / Yogurt",       qty: 0.05  },  // 50 g
      { name: "Cooking Oil",         qty: 30    },  // 30 mL
      { name: "Spice Mix",           qty: 20    },  // 20 g
      { name: "Ginger-Garlic Paste", qty: 12    },  // 12 g
    ],
  },
  {
    menuItemName: "Mango Lassi",
    note: "Chilled mango yogurt drink — per glass",
    ingredients: [
      { name: "Mango Pulp",          qty: 150   },  // 150 mL
      { name: "Curd / Yogurt",       qty: 0.1   },  // 100 g
      { name: "Milk",                qty: 100   },  // 100 mL
    ],
  },
  {
    menuItemName: "Cold Coffee",
    note: "Blended iced coffee — per glass",
    ingredients: [
      { name: "Coffee Powder",       qty: 15    },  // 15 g
      { name: "Milk",                qty: 200   },  // 200 mL
      { name: "Fresh Cream",         qty: 30    },  // 30 mL
    ],
  },
]

let recipeCount = 0
let riCount = 0

for (const def of recipeDefs) {
  const menuItem = menuByName[def.menuItemName]
  if (!menuItem) {
    console.warn(`  Skipped recipe "${def.menuItemName}" — menu item not found`)
    continue
  }

  const [recipe] = await db
    .insert(recipes)
    .values({ menuItemId: menuItem.id, note: def.note })
    .returning()

  recipeCount++

  for (const ri of def.ingredients) {
    const ingredient = byName[ri.name]
    if (!ingredient) {
      console.warn(`  Skipped ingredient "${ri.name}" in "${def.menuItemName}"`)
      continue
    }
    await db.insert(recipeIngredients).values({
      recipeId: recipe!.id,
      ingredientId: ingredient.id,
      quantity: String(ri.qty),
    })
    riCount++
  }

  console.log(`  Recipe: ${def.menuItemName} (${def.ingredients.length} ingredients)`)
}

console.log(`\nDone! ${recipeCount} recipes, ${riCount} recipe-ingredient links`)
process.exit(0)
