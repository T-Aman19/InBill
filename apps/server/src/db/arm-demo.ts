/**
 * Re-arm the demo outlet to a clean, camera-ready state before a video take.
 * Scoped entirely to The Indian Kitchen (setup code SAFFRON). Idempotent &
 * repeatable. Does three things:
 *   1. Clears ALL live (unbilled) orders + KOTs and frees their tables — wipes
 *      leftovers from prior automated runs so the KDS/floor start clean.
 *   2. Shifts the paid-bill history forward so the latest day lands "today"
 *      (keeps the manager "revenue today" tiles populated).
 *   3. Re-stages a fresh live scene: 3 in-flight KOTs (POS + QR, minutes old)
 *      and one served table with an unpaid GST bill for the billing take.
 *
 * Run: SEED_DB_URL="postgres://…" bun run src/db/arm-demo.ts
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"

const RAW = process.env["SEED_DB_URL"]
if (!RAW) throw new Error("Set SEED_DB_URL")
const sql = postgres(RAW.split("?")[0]!, { ssl: "require", max: 1 })
const SETUP = process.env["ARM_SETUP_CODE"] ?? "SAFFRON"

const money = (n: number) => n.toFixed(2)
const r2 = (n: number) => Math.round(n * 100) / 100
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

const [outlet] = await sql`select id, name from outlets where setup_code=${SETUP}`
if (!outlet) throw new Error(`no outlet for setup code ${SETUP}`)
const O = outlet.id as string
console.log(`Arming "${outlet.name}" (${O.slice(0, 8)})…`)

// ── 1. Clear live orders (unbilled + the staged bill-ready one) + free tables ─
const live = await sql`select o.id from orders o where o.outlet_id=${O}
  and (o.status in ('open','kot_sent','served')
       or (o.status = 'billed' and exists (select 1 from bills b where b.order_id = o.id and b.is_paid = false)))`
const ids = live.map((r) => r.id as string)
if (ids.length) {
  const oi = await sql`select id from order_items where order_id in ${sql(ids)}`
  const oiIds = oi.map((r) => r.id as string)
  if (oiIds.length) await sql`delete from order_item_modifiers where order_item_id in ${sql(oiIds)}`
  const bl = await sql`select id from bills where order_id in ${sql(ids)}`
  const blIds = bl.map((r) => r.id as string)
  if (blIds.length) {
    await sql`delete from bill_payments where bill_id in ${sql(blIds)}`
    await sql`delete from bill_discounts where bill_id in ${sql(blIds)}`
    await sql`delete from bill_charges where bill_id in ${sql(blIds)}`
    await sql`delete from bills where id in ${sql(blIds)}`
  }
  await sql`delete from kots where order_id in ${sql(ids)}`
  await sql`delete from order_items where order_id in ${sql(ids)}`
  await sql`update tables set status='available', current_order_id=null where current_order_id in ${sql(ids)}`
  await sql`delete from orders where id in ${sql(ids)}`
}
console.log(`  cleared ${ids.length} live orders`)

// ── 2. Shift paid history so the newest bills are "today" ────────────────────
const [{ maxd }] = await sql`select max(created_at) maxd from bills where outlet_id=${O} and is_paid`
if (maxd) {
  const days = Math.floor((Date.now() - new Date(maxd as string).getTime()) / 86_400_000)
  if (days > 0) {
    const iv = `${days} days`
    await sql`update bills set created_at = created_at + ${iv}::interval where outlet_id=${O}`
    await sql`update orders set created_at = created_at + ${iv}::interval, updated_at = updated_at + ${iv}::interval where outlet_id=${O} and status='billed'`
    await sql`update kots set created_at = created_at + ${iv}::interval where outlet_id=${O} and status='done'`
    console.log(`  shifted bill history forward ${days} day(s) → latest lands today`)
  }
}

// ── 3. Re-stage a fresh live scene ───────────────────────────────────────────
const itemRows = await sql`select id, name, base_price, is_veg from menu_items where outlet_id=${O}`
const byName = new Map(itemRows.map((r) => [r.name as string, r]))
const tableRows = await sql`select id, name from tables where outlet_id=${O}`
const tableByName = new Map(tableRows.map((r) => [r.name as string, r.id as string]))
const [server] = await sql`select id from users where outlet_id=${O} and role='captain' limit 1`
const [cashier] = await sql`select id from users where outlet_id=${O} and role in ('cashier','owner') limit 1`
const [{ bn }] = await sql`select coalesce(max(bill_number),0) bn from bills where outlet_id=${O}`
const [{ kn }] = await sql`select coalesce(max(kot_number),0) kn from kots where outlet_id=${O}`
let billNo = Number(bn), kotNo = Number(kn)
const mins = (m: number) => sql`now() - ${`${m} minutes`}::interval`

async function stageKot(tableName: string, source: string, status: "pending" | "acknowledged", picks: [string, number][]) {
  const tId = tableByName.get(tableName)
  if (!tId) return
  const orderId = randomUUID(), kotId = randomUUID(), ageM = randInt(2, 9)
  await sql`insert into orders (id, outlet_id, table_id, server_id, type, source, status, guest_count, created_at, updated_at)
            values (${orderId}, ${O}, ${tId}, ${server?.id ?? null}, 'dine_in', ${source}, 'kot_sent', ${randInt(2, 5)}, ${mins(ageM)}, now())`
  await sql`insert into kots (id, outlet_id, order_id, kot_number, status, created_at)
            values (${kotId}, ${O}, ${orderId}, ${++kotNo}, ${status}, ${mins(ageM)})`
  for (const [nm, qty] of picks) {
    const it = byName.get(nm); if (!it) continue
    await sql`insert into order_items (id, order_id, kot_id, menu_item_id, name, unit_price, quantity)
              values (${randomUUID()}, ${orderId}, ${kotId}, ${it.id}, ${it.name}, ${it.base_price}, ${qty})`
  }
  await sql`update tables set status='occupied', current_order_id=${orderId} where id=${tId}`
}

await stageKot("T4", "pos", "pending", [["Paneer Butter Masala", 1], ["Butter Naan", 2], ["Chicken Dum Biryani", 1]])
await stageKot("A2", "qr", "acknowledged", [["Masala Dosa", 2], ["Filter Coffee", 1], ["Mango Lassi", 1]])
await stageKot("T7", "pos", "pending", [["Tandoori Chicken (Half)", 1], ["Garlic Naan", 1], ["Dal Makhani", 1]])

// Served table with an unpaid GST bill → billing take
{
  const tId = tableByName.get("A5")
  if (tId) {
    const orderId = randomUUID(), kotId = randomUUID(), billId = randomUUID()
    const picks: [string, number][] = [["Butter Chicken", 1], ["Chicken Dum Biryani", 1], ["Garlic Naan", 2], ["Butter Naan", 2], ["Gulab Jamun (2 pc)", 1]]
    let subtotal = 0
    // status 'billed' (a bill exists) → floor derives it to "Bill ready" and the
    // order screen shows "Collect Payment".
    await sql`insert into orders (id, outlet_id, table_id, server_id, type, source, status, guest_count, created_at, updated_at)
              values (${orderId}, ${O}, ${tId}, ${server?.id ?? null}, 'dine_in', 'pos', 'billed', 4, ${mins(28)}, now())`
    await sql`insert into kots (id, outlet_id, order_id, kot_number, status, created_at)
              values (${kotId}, ${O}, ${orderId}, ${++kotNo}, 'done', ${mins(28)})`
    for (const [nm, qty] of picks) {
      const it = byName.get(nm); if (!it) continue
      subtotal += Number(it.base_price) * qty
      await sql`insert into order_items (id, order_id, kot_id, menu_item_id, name, unit_price, quantity)
                values (${randomUUID()}, ${orderId}, ${kotId}, ${it.id}, ${it.name}, ${it.base_price}, ${qty})`
    }
    subtotal = r2(subtotal)
    const cgst = r2(subtotal * 0.025), sgst = r2(subtotal * 0.025), taxTotal = r2(cgst + sgst), total = r2(subtotal + taxTotal)
    await sql`insert into bills (id, outlet_id, order_id, bill_number, subtotal, tax_lines, tax_total, total, is_paid, created_by_id, created_at)
              values (${billId}, ${O}, ${orderId}, ${++billNo}, ${money(subtotal)},
                      ${sql.json([{ name: "CGST", rate: 2.5, amount: cgst }, { name: "SGST", rate: 2.5, amount: sgst }])},
                      ${money(taxTotal)}, ${money(total)}, false, ${cashier?.id ?? null}, ${mins(2)})`
    await sql`update tables set status='billed', current_order_id=${orderId} where id=${tId}`
    console.log(`  staged unpaid bill #${billNo} on A5 (₹${total}) for billing take`)
  }
}

console.log("✓ armed.")
await sql.end()
