/**
 * Demo seed — creates the demo owner, a flagship outlet plus two secondary
 * outlets, staff, menu, floor/tables, and ~30 days of synthetic paid bills
 * (through today) so both demo.tresiphi.com entry points have real-looking
 * data on first load: the flagship's /floor, and /owner/dashboard's
 * multi-outlet revenue view.
 *
 * Shares this DB with nothing else — this script (and reset-demo.ts, which
 * calls runSeed() after truncating) is only ever run against the isolated
 * demo database.
 *
 * Run: bun run src/db/seed-demo.ts
 */
import { eq } from "drizzle-orm"
import { db } from "./index.js"
import { owners, outlets, users, categories, menuItems, taxConfigs, floors, tables, orders, orderItems, bills, billPayments } from "./schema/index.js"

const PAYMENT_MODES = ["cash", "upi", "card"] as const

const MENU: Record<string, { name: string; basePrice: string; isVeg: boolean }[]> = {
  Starters: [
    { name: "Paneer Tikka", basePrice: "280", isVeg: true },
    { name: "Chicken 65",   basePrice: "320", isVeg: false },
  ],
  Mains: [
    { name: "Dal Makhani",    basePrice: "240", isVeg: true },
    { name: "Butter Chicken", basePrice: "380", isVeg: false },
    { name: "Veg Biryani",    basePrice: "260", isVeg: true },
  ],
  Drinks: [
    { name: "Mango Lassi", basePrice: "120", isVeg: true },
    { name: "Cold Coffee", basePrice: "150", isVeg: true },
  ],
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]!
}

type MenuItemRef = { id: string; name: string; basePrice: string }

async function seedOutlet(ownerId: string, opts: {
  name: string; address: string; phone: string; setupCode: string
  fullFloor: boolean; billsPerDay: [number, number]
}) {
  const [outlet] = await db.insert(outlets).values({
    ownerId,
    name: opts.name,
    address: opts.address,
    phone: opts.phone,
    gstin: "29ABCDE1234F1Z5",
    setupCode: opts.setupCode,
  }).returning()
  const outletId = outlet!.id

  await db.insert(taxConfigs).values({ outletId, name: "GST 5%", cgstRate: "2.5", sgstRate: "2.5" })

  const staffRows = opts.fullFloor
    ? await db.insert(users).values([
        { outletId, name: "Manager", pin: "1111", role: "manager" },
        { outletId, name: "Cashier", pin: "2222", role: "cashier" },
        { outletId, name: "Captain", pin: "3333", role: "captain" },
        { outletId, name: "Kitchen", pin: "4444", role: "kitchen" },
        { outletId, name: "Host",    pin: "5555", role: "host"    },
      ]).returning()
    : await db.insert(users).values({ outletId, name: "Manager", pin: "1111", role: "manager" }).returning()
  const managerId = staffRows.find((u) => u.role === "manager")!.id

  const [floor] = await db.insert(floors).values({ outletId, name: "Ground Floor" }).returning()
  const tableSeeds = opts.fullFloor
    ? [{ name: "T1", capacity: 2 }, { name: "T2", capacity: 4 }, { name: "T3", capacity: 4 }, { name: "T4", capacity: 6 }, { name: "T5", capacity: 6 }]
    : [{ name: "T1", capacity: 2 }, { name: "T2", capacity: 4 }]
  const seededTables = await db.insert(tables).values(
    tableSeeds.map((t) => ({ outletId, floorId: floor!.id, ...t })),
  ).returning()
  const tableIds = seededTables.map((t) => t.id)

  const menuItemRefs: MenuItemRef[] = []
  let sortOrder = 0
  for (const [catName, items] of Object.entries(MENU)) {
    const [cat] = await db.insert(categories).values({ outletId, name: catName, sortOrder: sortOrder++ }).returning()
    const inserted = await db.insert(menuItems).values(
      items.map((it) => ({ outletId, categoryId: cat!.id, name: it.name, basePrice: it.basePrice, isVeg: it.isVeg })),
    ).returning()
    menuItemRefs.push(...inserted.map((m) => ({ id: m.id, name: m.name, basePrice: m.basePrice })))
  }

  // ~30 days of synthetic paid bills through today, so the owner dashboard's
  // default "today" range and the flagship's reports both show real numbers.
  let billNumber = 0
  const now = Date.now()
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const billsToday = randInt(opts.billsPerDay[0], opts.billsPerDay[1])
    for (let i = 0; i < billsToday; i++) {
      const createdAt = new Date(now - daysAgo * 86_400_000)
      createdAt.setHours(randInt(11, 22), randInt(0, 59), 0, 0)

      const lines = Array.from({ length: randInt(1, 4) }, () => ({ item: pick(menuItemRefs), qty: randInt(1, 3) }))
      const subtotal = lines.reduce((s, l) => s + Number(l.item.basePrice) * l.qty, 0)
      const cgst = Number((subtotal * 0.025).toFixed(2))
      const sgst = Number((subtotal * 0.025).toFixed(2))
      const taxTotal = Number((cgst + sgst).toFixed(2))
      const total = Number((subtotal + taxTotal).toFixed(2))

      const [order] = await db.insert(orders).values({
        outletId, tableId: pick(tableIds), serverId: managerId,
        type: "dine_in", status: "billed", createdAt, updatedAt: createdAt,
      }).returning()

      await db.insert(orderItems).values(
        lines.map((l) => ({ orderId: order!.id, menuItemId: l.item.id, name: l.item.name, unitPrice: l.item.basePrice, quantity: l.qty })),
      )

      billNumber++
      const [bill] = await db.insert(bills).values({
        outletId, orderId: order!.id, billNumber,
        subtotal: subtotal.toFixed(2),
        taxLines: [{ name: "CGST", rate: 2.5, amount: cgst }, { name: "SGST", rate: 2.5, amount: sgst }],
        taxTotal: taxTotal.toFixed(2),
        total: total.toFixed(2),
        isPaid: true,
        createdById: managerId,
        createdAt,
      }).returning()

      await db.insert(billPayments).values({ billId: bill!.id, mode: pick(PAYMENT_MODES), amount: total.toFixed(2), createdAt })
    }
  }

  return { outletId, tableIds, managerId, menuItemRefs }
}

export async function runSeed(): Promise<void> {
  console.log("Seeding demo...")

  const [owner] = await db.insert(owners).values({
    name: "Demo Owner",
    email: "demo-owner@inbill.app",
    passwordHash: await Bun.password.hash(crypto.randomUUID()),
    phone: "9999999999",
  }).returning()
  console.log("Owner:", owner!.email)

  const flagship = await seedOutlet(owner!.id, {
    name: "InBill Demo Restaurant", address: "123 MG Road, Bengaluru", phone: "9888888888",
    setupCode: "DEMO01", fullFloor: true, billsPerDay: [15, 30],
  })
  console.log("Flagship outlet seeded:", flagship.outletId)

  await seedOutlet(owner!.id, {
    name: "Demo Cafe — Koramangala", address: "80 Koramangala 5th Block, Bengaluru", phone: "9888888801",
    setupCode: "DEMO02", fullFloor: false, billsPerDay: [5, 12],
  })
  await seedOutlet(owner!.id, {
    name: "Demo Cloud Kitchen — HSR", address: "22 HSR Layout, Bengaluru", phone: "9888888802",
    setupCode: "DEMO03", fullFloor: false, billsPerDay: [3, 8],
  })
  console.log("Secondary outlets seeded")

  // A couple of live occupied tables on the flagship floor so /floor feels
  // alive on first load instead of showing five empty tables. Table status is
  // derived from `tables.currentOrderId` (see routes/tables.ts), not a scan
  // over orders — so the table row must point at the order explicitly.
  for (const tableId of flagship.tableIds.slice(1, 3)) {
    const [order] = await db.insert(orders).values({
      outletId: flagship.outletId, tableId, serverId: flagship.managerId, type: "dine_in", status: "served",
    }).returning()
    const item = pick(flagship.menuItemRefs)
    await db.insert(orderItems).values({ orderId: order!.id, menuItemId: item.id, name: item.name, unitPrice: item.basePrice, quantity: 2 })
    await db.update(tables).set({ currentOrderId: order!.id, status: "occupied" }).where(eq(tables.id, tableId))
  }
  console.log("Live floor state seeded")

  console.log("Demo seed complete.")
}

if (import.meta.main) {
  await runSeed()
  process.exit(0)
}
