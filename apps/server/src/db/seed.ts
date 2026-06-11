/**
 * Dev seed — creates one owner, one outlet, staff accounts, sample menu, and floor.
 * Run: bun run src/db/seed.ts
 */
import { db } from "./index.js"
import { owners, outlets, users, categories, menuItems, taxConfigs, floors, tables } from "./schema/index.js"

console.log("Seeding...")

// Owner
const [owner] = await db
  .insert(owners)
  .values({
    name: "Test Owner",
    email: "owner@inbill.app",
    passwordHash: await Bun.password.hash("password123"),
    phone: "9999999999",
  })
  .returning()
console.log("Owner:", owner!.email)

// Outlet
const [outlet] = await db
  .insert(outlets)
  .values({
    ownerId: owner!.id,
    name: "InBill Demo Restaurant",
    address: "123 MG Road, Bengaluru",
    phone: "9888888888",
    gstin: "29ABCDE1234F1Z5",
    setupCode: "DEMO01",
  })
  .returning()
console.log("Outlet:", outlet!.name)

// Tax config (GST 5% for restaurant)
await db.insert(taxConfigs).values({
  outletId: outlet!.id,
  name: "GST 5%",
  cgstRate: "2.5",
  sgstRate: "2.5",
})

// Staff
await db.insert(users).values([
  { outletId: outlet!.id, name: "Manager",  pin: "1111", role: "manager"  },
  { outletId: outlet!.id, name: "Cashier",  pin: "2222", role: "cashier"  },
  { outletId: outlet!.id, name: "Captain",  pin: "3333", role: "captain"  },
  { outletId: outlet!.id, name: "Kitchen",  pin: "4444", role: "kitchen"  },
  { outletId: outlet!.id, name: "Host",     pin: "5555", role: "host"     },
])
console.log("Staff: pins 1111 / 2222 / 3333 / 4444 / 5555")

// Menu
const [starters] = await db.insert(categories).values({ outletId: outlet!.id, name: "Starters", sortOrder: 1 }).returning()
const [mains]    = await db.insert(categories).values({ outletId: outlet!.id, name: "Mains",    sortOrder: 2 }).returning()
const [drinks]   = await db.insert(categories).values({ outletId: outlet!.id, name: "Drinks",   sortOrder: 3 }).returning()

await db.insert(menuItems).values([
  { outletId: outlet!.id, categoryId: starters!.id, name: "Paneer Tikka",     basePrice: "280", isVeg: true  },
  { outletId: outlet!.id, categoryId: starters!.id, name: "Chicken 65",       basePrice: "320", isVeg: false },
  { outletId: outlet!.id, categoryId: mains!.id,    name: "Dal Makhani",       basePrice: "240", isVeg: true  },
  { outletId: outlet!.id, categoryId: mains!.id,    name: "Butter Chicken",    basePrice: "380", isVeg: false },
  { outletId: outlet!.id, categoryId: mains!.id,    name: "Veg Biryani",       basePrice: "260", isVeg: true  },
  { outletId: outlet!.id, categoryId: drinks!.id,   name: "Mango Lassi",       basePrice: "120", isVeg: true  },
  { outletId: outlet!.id, categoryId: drinks!.id,   name: "Cold Coffee",       basePrice: "150", isVeg: true  },
])
console.log("Menu: 7 items across 3 categories")

// Floor + tables
const [floor] = await db.insert(floors).values({ outletId: outlet!.id, name: "Ground Floor" }).returning()
await db.insert(tables).values([
  { outletId: outlet!.id, floorId: floor!.id, name: "T1", capacity: 2 },
  { outletId: outlet!.id, floorId: floor!.id, name: "T2", capacity: 4 },
  { outletId: outlet!.id, floorId: floor!.id, name: "T3", capacity: 4 },
  { outletId: outlet!.id, floorId: floor!.id, name: "T4", capacity: 6 },
  { outletId: outlet!.id, floorId: floor!.id, name: "T5", capacity: 6 },
])
console.log("Tables: T1–T5 on Ground Floor")

console.log("\nDone! Outlet ID:", outlet!.id)
console.log("Use this outlet ID when logging in via PIN.")
process.exit(0)
