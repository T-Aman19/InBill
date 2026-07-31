/**
 * Demo seed for demo.tresiphi.com — creates ONE new, self-contained outlet
 * ("Saffron Kitchen") with a full Indian menu, staff, GST, a month of paid
 * bills, live open orders + KOTs, and a split-tender bill. Inserts only; never
 * touches existing outlets.
 *
 * Run:  DATABASE_URL unused — the Neon URL is read from SEED_DB_URL.
 *   SEED_DB_URL="postgres://..." bun run src/db/seed-demo.ts
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index.js"

const {
  owners, outlets, users, taxConfigs, categories, menuItems, itemVariants,
  modifierGroups, modifiers, menuItemModifierGroups, floors, tables, customers,
  discounts, charges, ingredients, orders, orderItems, kots, bills, billPayments,
  billDiscounts,
} = schema

const RAW = process.env["SEED_DB_URL"]
if (!RAW) throw new Error("Set SEED_DB_URL to the target database URL")
const client = postgres(RAW.split("?")[0]!, { ssl: "require", max: 1 })
const d = drizzle(client, { schema })

const OWNER_EMAIL = "demo.saffron@tresiphi.com"
const SETUP_CODE = "SAFFRON"

// ── helpers ──────────────────────────────────────────────────────────────────
const money = (n: number) => n.toFixed(2)
const r2 = (n: number) => Math.round(n * 100) / 100
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!
const chance = (p: number) => Math.random() < p

// "today" in IST, so bills land on the right calendar day for the manager view.
const _ist = new Date(Date.now() + 5.5 * 3600_000)
const IY = _ist.getUTCFullYear(), IM = _ist.getUTCMonth(), ID = _ist.getUTCDate()
const istInstant = (daysAgo: number, hh: number, mm: number) =>
  new Date(Date.UTC(IY, IM, ID - daysAgo, hh, mm) - 5.5 * 3600_000)

async function insertChunked<T>(table: any, rows: T[], size = 400) {
  for (let i = 0; i < rows.length; i += size) await d.insert(table).values(rows.slice(i, i + size))
}

// ── guard: never double-seed ─────────────────────────────────────────────────
const existing = (await client`select 1 from owners where email=${OWNER_EMAIL}`).length
if (existing) {
  console.log(`Owner ${OWNER_EMAIL} already exists — aborting to avoid duplicates.`)
  await client.end()
  process.exit(0)
}

console.log("Seeding Saffron Kitchen…")

// ── owner + outlet ───────────────────────────────────────────────────────────
const ownerId = randomUUID()
await d.insert(owners).values({
  id: ownerId,
  name: "Rohan Mehta",
  email: OWNER_EMAIL,
  passwordHash: await Bun.password.hash("saffron123"),
  phone: "9810012345",
})

const outletId = randomUUID()
await d.insert(outlets).values({
  id: outletId,
  ownerId,
  name: "Saffron Kitchen",
  address: "12, 100 Feet Road, Indiranagar, Bengaluru 560038",
  phone: "9845098450",
  gstin: "29ABCDS1234K1Z9",
  fssaiNumber: "11223333001234",
  upiVpa: "saffronkitchen@okhdfcbank",
  setupCode: SETUP_CODE,
  settings: { hasTables: true, hasKitchenWorkflow: true, deliveryEnabled: true },
})

// ── tax ──────────────────────────────────────────────────────────────────────
const taxId = randomUUID()
await d.insert(taxConfigs).values({ id: taxId, outletId, name: "GST 5%", cgstRate: "2.5", sgstRate: "2.5" })

// ── staff (PINs hashed argon2id) ─────────────────────────────────────────────
const staff = [
  { name: "Rohan Mehta", pin: "1234", role: "owner" as const },
  { name: "Priya Nair", pin: "1111", role: "manager" as const },
  { name: "Arjun Rao", pin: "2222", role: "cashier" as const },
  { name: "Neha Gupta", pin: "2233", role: "cashier" as const },
  { name: "Imran Khan", pin: "3333", role: "captain" as const },
  { name: "Sana Ali", pin: "3344", role: "captain" as const },
  { name: "Chef Vikram", pin: "4444", role: "kitchen" as const },
  { name: "Divya Menon", pin: "5555", role: "host" as const },
]
const staffRows = await Promise.all(
  staff.map(async (s) => ({ id: randomUUID(), outletId, name: s.name, role: s.role, pin: await Bun.password.hash(s.pin, { algorithm: "argon2id" }) })),
)
await d.insert(users).values(staffRows)
const cashiers = staffRows.filter((s) => s.role === "cashier" || s.role === "owner")
const servers = staffRows.filter((s) => s.role === "captain" || s.role === "cashier")

// ── menu ─────────────────────────────────────────────────────────────────────
// [name, price, isVeg]
type I = [string, number, boolean]
const MENU: Record<string, I[]> = {
  "Soups": [
    ["Sweet Corn Soup", 160, true], ["Hot & Sour Soup", 170, true], ["Manchow Soup", 180, true],
    ["Tomato Shorba", 150, true], ["Chicken Clear Soup", 190, false], ["Lung Fung Soup", 200, false],
  ],
  "Veg Starters": [
    ["Paneer Tikka", 320, true], ["Malai Paneer Tikka", 340, true], ["Hara Bhara Kabab", 260, true],
    ["Veg Spring Roll", 240, true], ["Crispy Corn", 260, true], ["Chilli Paneer", 300, true],
    ["Mushroom Tikka", 300, true], ["Tandoori Aloo", 270, true], ["Veg Seekh Kabab", 280, true],
    ["Dahi Ke Kabab", 290, true], ["Paneer 65", 300, true], ["Honey Chilli Potato", 250, true],
    ["Cheese Corn Nuggets", 270, true], ["Soya Chaap Tikka", 290, true],
  ],
  "Non-Veg Starters": [
    ["Chicken Tikka", 360, false], ["Malai Chicken Tikka", 380, false], ["Chicken 65", 340, false],
    ["Chilli Chicken", 350, false], ["Chicken Seekh Kabab", 360, false], ["Fish Amritsari", 420, false],
    ["Tandoori Prawns", 520, false], ["Mutton Seekh Kabab", 420, false], ["Chicken Lollipop", 340, false],
    ["Drums of Heaven", 360, false], ["Fish Tikka", 440, false], ["Pepper Chicken", 350, false],
    ["Egg Chilli", 240, false], ["Ghee Roast Chicken", 390, false],
  ],
  "Tandoor": [
    ["Tandoori Chicken (Half)", 340, false], ["Tandoori Chicken (Full)", 620, false],
    ["Afghani Chicken", 400, false], ["Reshmi Kabab", 380, false], ["Tangdi Kabab", 360, false],
    ["Barra Kabab (Mutton)", 480, false], ["Paneer Malai Tikka", 340, true], ["Tandoori Broccoli", 320, true],
    ["Stuffed Mushroom", 320, true], ["Tandoori Platter (Veg)", 520, true], ["Tandoori Platter (Non-Veg)", 720, false],
  ],
  "Chaat & Street": [
    ["Samosa Chaat", 160, true], ["Aloo Tikki Chaat", 170, true], ["Pani Puri", 120, true],
    ["Dahi Bhalla", 160, true], ["Papdi Chaat", 160, true], ["Raj Kachori", 190, true],
    ["Bhel Puri", 130, true], ["Sev Puri", 130, true], ["Pav Bhaji", 220, true], ["Vada Pav", 90, true],
  ],
  "Veg Main Course": [
    ["Paneer Butter Masala", 340, true], ["Kadai Paneer", 340, true], ["Palak Paneer", 320, true],
    ["Shahi Paneer", 340, true], ["Paneer Lababdar", 350, true], ["Malai Kofta", 330, true],
    ["Veg Kolhapuri", 300, true], ["Kadai Veg", 300, true], ["Aloo Gobi", 260, true],
    ["Bhindi Masala", 260, true], ["Mix Veg", 280, true], ["Dum Aloo", 290, true],
    ["Mushroom Masala", 310, true], ["Chana Masala", 260, true], ["Rajma Masala", 250, true],
    ["Baingan Bharta", 270, true], ["Methi Malai Matar", 300, true], ["Veg Handi", 320, true],
    ["Soya Chaap Masala", 300, true], ["Paneer Bhurji", 300, true],
  ],
  "Non-Veg Main Course": [
    ["Butter Chicken", 420, false], ["Chicken Tikka Masala", 420, false], ["Kadai Chicken", 400, false],
    ["Chicken Curry", 360, false], ["Chicken Do Pyaza", 390, false], ["Methi Chicken", 400, false],
    ["Chicken Chettinad", 410, false], ["Mutton Rogan Josh", 520, false], ["Mutton Curry", 500, false],
    ["Mutton Keema", 480, false], ["Fish Curry", 460, false], ["Prawn Masala", 540, false],
    ["Egg Curry", 260, false], ["Chicken Handi", 440, false], ["Laal Maas", 560, false],
    ["Andhra Chicken", 410, false], ["Chicken Saagwala", 400, false], ["Home-style Chicken", 370, false],
  ],
  "Biryani & Pulao": [
    ["Chicken Dum Biryani", 380, false], ["Mutton Dum Biryani", 480, false], ["Veg Dum Biryani", 300, true],
    ["Hyderabadi Chicken Biryani", 400, false], ["Egg Biryani", 280, false], ["Prawn Biryani", 460, false],
    ["Paneer Biryani", 320, true], ["Jeera Rice", 180, true], ["Veg Pulao", 220, true],
    ["Kashmiri Pulao", 260, true], ["Steamed Rice", 150, true], ["Curd Rice", 190, true],
  ],
  "Dal & Rice": [
    ["Dal Makhani", 280, true], ["Dal Tadka", 240, true], ["Dal Fry", 230, true],
    ["Panchmel Dal", 260, true], ["Yellow Dal", 220, true],
  ],
  "Indian Breads": [
    ["Tandoori Roti", 30, true], ["Butter Naan", 60, true], ["Garlic Naan", 80, true],
    ["Butter Roti", 40, true], ["Laccha Paratha", 70, true], ["Cheese Naan", 110, true],
    ["Missi Roti", 60, true], ["Stuffed Kulcha", 90, true], ["Plain Kulcha", 60, true],
    ["Rumali Roti", 40, true], ["Amritsari Kulcha", 120, true], ["Pudina Paratha", 70, true],
  ],
  "Indo-Chinese": [
    ["Veg Hakka Noodles", 240, true], ["Chicken Hakka Noodles", 280, false], ["Veg Fried Rice", 230, true],
    ["Chicken Fried Rice", 280, false], ["Schezwan Fried Rice", 260, true], ["Veg Manchurian", 260, true],
    ["Chicken Manchurian", 300, false], ["Chilli Garlic Noodles", 250, true], ["Paneer Chilli Dry", 300, true],
    ["Triple Schezwan Rice", 320, false], ["Veg Manchow Noodles", 250, true], ["Egg Fried Rice", 240, false],
  ],
  "South Indian": [
    ["Masala Dosa", 180, true], ["Plain Dosa", 140, true], ["Mysore Masala Dosa", 200, true],
    ["Rava Dosa", 190, true], ["Onion Uttapam", 190, true], ["Idli Sambar", 140, true],
    ["Medu Vada", 130, true], ["Ghee Pongal", 170, true], ["Cheese Dosa", 220, true],
    ["Set Dosa", 160, true], ["Podi Idli", 160, true], ["Filter Coffee", 70, true],
  ],
  "Desserts": [
    ["Gulab Jamun (2 pc)", 120, true], ["Rasmalai (2 pc)", 150, true], ["Gajar Ka Halwa", 180, true],
    ["Kulfi Falooda", 190, true], ["Moong Dal Halwa", 200, true], ["Jalebi with Rabri", 180, true],
    ["Ice Cream (2 scoops)", 140, true], ["Brownie with Ice Cream", 220, true], ["Phirni", 160, true],
    ["Shahi Tukda", 190, true],
  ],
  "Beverages & Mocktails": [
    ["Masala Chai", 60, true], ["Sweet Lassi", 120, true], ["Salted Lassi", 110, true],
    ["Mango Lassi", 140, true], ["Fresh Lime Soda", 90, true], ["Virgin Mojito", 180, true],
    ["Blue Lagoon", 180, true], ["Cold Coffee", 160, true], ["Buttermilk", 80, true],
    ["Watermelon Cooler", 170, true], ["Masala Soda", 90, true], ["Green Apple Mojito", 180, true],
    ["Fresh Orange Juice", 150, true], ["Aam Panna", 120, true], ["Rose Falooda", 190, true],
    ["Mineral Water", 30, true],
  ],
}

const catRows: { id: string; outletId: string; name: string; sortOrder: number }[] = []
const itemRows: any[] = []
type FlatItem = { id: string; name: string; price: number; veg: boolean; cat: string }
const flat: FlatItem[] = []
let catSort = 1
for (const [catName, items] of Object.entries(MENU)) {
  const catId = randomUUID()
  catRows.push({ id: catId, outletId, name: catName, sortOrder: catSort++ })
  let iSort = 1
  for (const [name, price, veg] of items) {
    const id = randomUUID()
    itemRows.push({ id, outletId, categoryId: catId, taxConfigId: taxId, name, basePrice: money(price), isVeg: veg, sortOrder: iSort++ })
    flat.push({ id, name, price, veg, cat: catName })
  }
}
await insertChunked(categories, catRows)
await insertChunked(menuItems, itemRows)
console.log(`Menu: ${itemRows.length} items across ${catRows.length} categories`)

// A few variants (half/full) + modifier groups
const biryani = flat.filter((f) => f.cat === "Biryani & Pulao" && f.name.includes("Biryani"))
await insertChunked(itemVariants, biryani.flatMap((b) => [
  { id: randomUUID(), itemId: b.id, name: "Half", price: money(r2(b.price * 0.6)) },
  { id: randomUUID(), itemId: b.id, name: "Full", price: money(b.price) },
]))
const gSpice = randomUUID(), gAdd = randomUUID()
await d.insert(modifierGroups).values([
  { id: gSpice, outletId, name: "Spice Level", required: true, multiSelect: false, minSelect: 1, maxSelect: 1 },
  { id: gAdd, outletId, name: "Add-ons", required: false, multiSelect: true, minSelect: 0, maxSelect: 3 },
])
await d.insert(modifiers).values([
  { id: randomUUID(), groupId: gSpice, name: "Mild", price: "0" },
  { id: randomUUID(), groupId: gSpice, name: "Medium", price: "0" },
  { id: randomUUID(), groupId: gSpice, name: "Spicy", price: "0" },
  { id: randomUUID(), groupId: gAdd, name: "Extra Gravy", price: "40" },
  { id: randomUUID(), groupId: gAdd, name: "Extra Cheese", price: "50" },
  { id: randomUUID(), groupId: gAdd, name: "Butter Topping", price: "30" },
])
const curryItems = flat.filter((f) => f.cat.includes("Main Course")).slice(0, 20)
await insertChunked(menuItemModifierGroups, curryItems.flatMap((c) => [
  { itemId: c.id, groupId: gSpice }, { itemId: c.id, groupId: gAdd },
]))

// ── floors + tables ──────────────────────────────────────────────────────────
const fGround = randomUUID(), fAC = randomUUID(), fTerrace = randomUUID()
await d.insert(floors).values([
  { id: fGround, outletId, name: "Ground Floor", sortOrder: 1 },
  { id: fAC, outletId, name: "AC Section", sortOrder: 2 },
  { id: fTerrace, outletId, name: "Terrace", sortOrder: 3 },
])
const tableRows: any[] = []
const tableIds: Record<string, string> = {}
const mkTables = (floorId: string, prefix: string, n: number, caps: number[]) => {
  for (let i = 1; i <= n; i++) {
    const id = randomUUID(); const name = `${prefix}${i}`
    tableIds[name] = id
    tableRows.push({ id, outletId, floorId, name, capacity: pick(caps) })
  }
}
mkTables(fGround, "T", 12, [2, 4, 4, 6])
mkTables(fAC, "A", 8, [2, 4, 6])
mkTables(fTerrace, "TR", 6, [4, 6, 8])
await d.insert(tables).values(tableRows)
const allTableIds = tableRows.map((t) => t.id)

// ── customers ────────────────────────────────────────────────────────────────
const custNames = ["Aditya Sharma", "Kavya Reddy", "Rahul Verma", "Ananya Iyer", "Siddharth Jain",
  "Meera Krishnan", "Karan Malhotra", "Pooja Desai", "Vivek Nair", "Shruti Kapoor", "Nikhil Bose",
  "Isha Agarwal", "Aman Tyagi", "Riya Singh", "Varun Pillai", "Tara Chatterjee", "Dev Anand",
  "Fatima Sheikh", "Gaurav Kulkarni", "Lakshmi Rao", "Manish Gupta", "Sneha Joshi", "Arnav Mehta",
  "Deepika Menon", "Rohit Bansal", "Nandini Shah", "Yash Thakur", "Priyanka Das", "Sameer Qureshi",
  "Aarti Saxena"]
const custRows = custNames.map((name, i) => ({
  id: randomUUID(), outletId, name,
  phone: `9${randInt(6, 8)}${String(randInt(10000000, 99999999)).padStart(8, "0")}`.slice(0, 10),
  loyaltyPoints: chance(0.7) ? randInt(20, 900) : 0,
}))
await d.insert(customers).values(custRows)
const custIds = custRows.map((c) => c.id)

// ── discounts + charges presets ──────────────────────────────────────────────
const dWeekday = randomUUID()
await d.insert(discounts).values([
  { id: dWeekday, outletId, name: "Weekday Lunch 10%", type: "percentage", value: "10", minOrderValue: "0" },
  { id: randomUUID(), outletId, name: "Flat ₹100 Off", type: "flat", value: "100", minOrderValue: "800" },
  { id: randomUUID(), outletId, name: "SAFFRON20", type: "percentage", value: "20", minOrderValue: "500", maxDiscountAmount: "300", code: "SAFFRON20" },
])
await d.insert(charges).values([
  { id: randomUUID(), outletId, name: "Service Charge", type: "percentage", value: "5", isActive: false },
  { id: randomUUID(), outletId, name: "Packaging Charge", type: "flat", value: "20", isActive: true },
])

// ── inventory (a couple below reorder → low-stock badge) ──────────────────────
await d.insert(ingredients).values([
  { id: randomUUID(), outletId, name: "Basmati Rice", unit: "kg", currentStock: "48", reorderLevel: "20", costPerUnit: "95" },
  { id: randomUUID(), outletId, name: "Paneer", unit: "kg", currentStock: "3.5", reorderLevel: "8", costPerUnit: "320" },
  { id: randomUUID(), outletId, name: "Chicken", unit: "kg", currentStock: "22", reorderLevel: "15", costPerUnit: "240" },
  { id: randomUUID(), outletId, name: "Mutton", unit: "kg", currentStock: "9", reorderLevel: "10", costPerUnit: "720" },
  { id: randomUUID(), outletId, name: "Onion", unit: "kg", currentStock: "60", reorderLevel: "25", costPerUnit: "35" },
  { id: randomUUID(), outletId, name: "Tomato", unit: "kg", currentStock: "40", reorderLevel: "20", costPerUnit: "40" },
  { id: randomUUID(), outletId, name: "Butter", unit: "kg", currentStock: "6", reorderLevel: "5", costPerUnit: "540" },
  { id: randomUUID(), outletId, name: "Fresh Cream", unit: "L", currentStock: "2", reorderLevel: "6", costPerUnit: "220" },
  { id: randomUUID(), outletId, name: "Refined Oil", unit: "L", currentStock: "35", reorderLevel: "15", costPerUnit: "140" },
  { id: randomUUID(), outletId, name: "Wheat Flour", unit: "kg", currentStock: "55", reorderLevel: "20", costPerUnit: "45" },
  { id: randomUUID(), outletId, name: "Curd", unit: "L", currentStock: "18", reorderLevel: "10", costPerUnit: "70" },
  { id: randomUUID(), outletId, name: "Ginger-Garlic Paste", unit: "kg", currentStock: "4", reorderLevel: "3", costPerUnit: "180" },
])

// ── historical + today paid bills ────────────────────────────────────────────
const popular = flat.filter((f) => /Biryani|Butter Chicken|Paneer Butter|Garlic Naan|Butter Naan|Dal Makhani|Chicken Tikka|Masala Dosa|Gulab Jamun|Mango Lassi|Tandoori Roti|Veg Hakka|Paneer Tikka/.test(f.name))
const lunch = () => [randInt(12, 15), randInt(0, 59)] as const
const dinner = () => [randInt(19, 22), randInt(0, 59)] as const

let billNo = 0, kotNo = 0
const oOrders: any[] = [], oItems: any[] = [], oKots: any[] = [], oBills: any[] = [], oPays: any[] = [], oBillDisc: any[] = []

function buildBill(createdAt: Date) {
  const orderId = randomUUID(), kotId = randomUUID()
  const type = chance(0.75) ? "dine_in" : chance(0.65) ? "takeaway" : "delivery"
  const source = type === "delivery" ? pick(["swiggy", "zomato"]) : type === "dine_in" && chance(0.2) ? "qr" : "pos"
  const server = pick(servers), cash = pick(cashiers)
  const nItems = randInt(2, 6)
  let subtotal = 0
  for (let i = 0; i < nItems; i++) {
    const it = chance(0.45) ? pick(popular) : pick(flat)
    const qty = randInt(1, 3)
    subtotal += it.price * qty
    oItems.push({ id: randomUUID(), orderId, kotId, menuItemId: it.id, name: it.name, unitPrice: money(it.price), quantity: qty })
  }
  subtotal = r2(subtotal)
  // discount on ~15%
  let discountAmount = 0, discLabel: string | null = null
  if (chance(0.15) && subtotal > 500) {
    discountAmount = r2(Math.min(subtotal * 0.1, 150)); discLabel = "Weekday Lunch 10%"
  }
  const base = r2(subtotal - discountAmount)
  const cgst = r2(base * 0.025), sgst = r2(base * 0.025)
  const taxTotal = r2(cgst + sgst)
  const total = r2(base + taxTotal)
  const billId = randomUUID()
  oOrders.push({ id: orderId, outletId, tableId: type === "dine_in" ? pick(allTableIds) : null, customerId: chance(0.5) ? pick(custIds) : null, serverId: server.id, type, source, status: "billed", guestCount: type === "dine_in" ? randInt(1, 6) : null, createdAt, updatedAt: createdAt })
  oKots.push({ id: kotId, outletId, orderId, kotNumber: ++kotNo, status: "done", createdAt })
  oBills.push({ id: billId, outletId, orderId, billNumber: ++billNo, subtotal: money(subtotal), taxLines: [{ name: "CGST", rate: 2.5, amount: cgst }, { name: "SGST", rate: 2.5, amount: sgst }], taxTotal: money(taxTotal), discountAmount: money(discountAmount), discountNote: discLabel, total: money(total), isPaid: true, createdById: cash.id, createdAt })
  if (discountAmount > 0) oBillDisc.push({ id: randomUUID(), billId, discountId: dWeekday, label: discLabel!, amount: money(discountAmount) })
  // payments — mostly single, ~8% split cash+upi
  if (chance(0.08)) {
    const part = r2(total * (0.4 + Math.random() * 0.2))
    oPays.push({ id: randomUUID(), billId, mode: "cash", amount: money(part), createdAt })
    oPays.push({ id: randomUUID(), billId, mode: "upi", amount: money(r2(total - part)), createdAt })
  } else {
    const mode = type === "delivery" ? "upi" : pick(["upi", "upi", "upi", "cash", "cash", "card"])
    oPays.push({ id: randomUUID(), billId, mode, amount: money(total), createdAt })
  }
}

// today — force the first as a clean cash+UPI split for the billing screenshot
for (let i = 0; i < 26; i++) {
  const [hh, mm] = i % 2 === 0 ? lunch() : dinner()
  buildBill(istInstant(0, hh, mm))
}
// previous 24 days
for (let day = 1; day <= 24; day++) {
  const weekend = [0, 6].includes(new Date(Date.UTC(IY, IM, ID - day)).getUTCDay())
  const n = weekend ? randInt(16, 24) : randInt(9, 18)
  for (let i = 0; i < n; i++) {
    const [hh, mm] = i % 2 === 0 ? lunch() : dinner()
    buildBill(istInstant(day, hh, mm))
  }
}
await insertChunked(orders, oOrders)
await insertChunked(orderItems, oItems)
await insertChunked(kots, oKots)
await insertChunked(bills, oBills)
await insertChunked(billPayments, oPays)
if (oBillDisc.length) await insertChunked(billDiscounts, oBillDisc)
console.log(`Bills: ${oBills.length} paid (${oItems.length} line items), ${oPays.length} payments`)

// ── live open orders + KOTs (KDS / order / floor / billing screenshots) ───────
const mins = (m: number) => new Date(Date.now() - m * 60_000)
const liveOrders: any[] = [], liveItems: any[] = [], liveKots: any[] = [], oBillsExtra: any[] = []
const tableUpdates: { id: string; status: string; orderId: string }[] = []

function liveOrder(tableName: string, source: string, kotStatus: "pending" | "acknowledged", opts: { unsent?: boolean; picks: string[] }) {
  const orderId = randomUUID(), kotId = randomUUID()
  const tId = tableIds[tableName]!
  liveOrders.push({ id: orderId, outletId, tableId: tId, serverId: pick(servers).id, type: "dine_in", source, status: "kot_sent", guestCount: randInt(2, 5), createdAt: mins(randInt(3, 9)), updatedAt: mins(1) })
  liveKots.push({ id: kotId, outletId, orderId, kotNumber: ++kotNo, status: kotStatus, createdAt: mins(randInt(3, 9)) })
  for (const nm of opts.picks) {
    const it = flat.find((f) => f.name === nm)!
    liveItems.push({ id: randomUUID(), orderId, kotId, menuItemId: it.id, name: it.name, unitPrice: money(it.price), quantity: randInt(1, 2) })
  }
  if (opts.unsent) {
    const it = pick(flat)
    liveItems.push({ id: randomUUID(), orderId, kotId: null, menuItemId: it.id, name: it.name, unitPrice: money(it.price), quantity: 1 })
  }
  tableUpdates.push({ id: tId, status: "occupied", orderId })
  return orderId
}

liveOrder("T4", "pos", "pending", { unsent: true, picks: ["Paneer Butter Masala", "Butter Naan", "Chicken Dum Biryani"] })
liveOrder("A2", "qr", "acknowledged", { picks: ["Masala Dosa", "Filter Coffee", "Mango Lassi"] })
liveOrder("T7", "pos", "pending", { picks: ["Tandoori Chicken (Half)", "Garlic Naan", "Dal Makhani"] })

// one served order with an UNPAID bill → billing page split-tender demo
{
  const orderId = randomUUID(), kotId = randomUUID(), billId = randomUUID(), tId = tableIds["A5"]!
  const picks = ["Butter Chicken", "Chicken Dum Biryani", "Garlic Naan", "Butter Naan", "Gulab Jamun (2 pc)"]
  let subtotal = 0
  liveOrders.push({ id: orderId, outletId, tableId: tId, customerId: pick(custIds), serverId: pick(servers).id, type: "dine_in", source: "pos", status: "served", guestCount: 4, createdAt: mins(35), updatedAt: mins(2) })
  liveKots.push({ id: kotId, outletId, orderId, kotNumber: ++kotNo, status: "done", createdAt: mins(35) })
  for (const nm of picks) { const it = flat.find((f) => f.name === nm)!; const q = nm.includes("Naan") ? 2 : 1; subtotal += it.price * q; liveItems.push({ id: randomUUID(), orderId, kotId, menuItemId: it.id, name: it.name, unitPrice: money(it.price), quantity: q }) }
  subtotal = r2(subtotal)
  const cgst = r2(subtotal * 0.025), sgst = r2(subtotal * 0.025), taxTotal = r2(cgst + sgst), total = r2(subtotal + taxTotal)
  oBillsExtra.push({ id: billId, outletId, orderId, billNumber: ++billNo, subtotal: money(subtotal), taxLines: [{ name: "CGST", rate: 2.5, amount: cgst }, { name: "SGST", rate: 2.5, amount: sgst }], taxTotal: money(taxTotal), total: money(total), isPaid: false, createdById: pick(cashiers).id, createdAt: mins(2) })
  tableUpdates.push({ id: tId, status: "billed", orderId })
}

await d.insert(orders).values(liveOrders)
await d.insert(orderItems).values(liveItems)
await d.insert(kots).values(liveKots)
if (oBillsExtra.length) await d.insert(bills).values(oBillsExtra)
for (const u of tableUpdates) await client`update tables set status=${u.status}, current_order_id=${u.orderId} where id=${u.id}`
console.log(`Live: ${liveOrders.length} open orders, ${liveKots.length} KOTs, ${tableUpdates.length} tables occupied`)

console.log("\n✓ Done.")
console.log("Outlet:", outletId, "· setup code:", SETUP_CODE)
await client.end()
process.exit(0)
