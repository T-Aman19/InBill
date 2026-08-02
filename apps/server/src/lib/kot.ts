import { and, eq, isNull, inArray, max } from "drizzle-orm"
import { db } from "../db/index.js"
import { kots, orderItems, orders, categories, menuItems, stations } from "../db/schema/index.js"
import { broadcastOutlet } from "../services/ws.js"

/**
 * Resolve each menu item's effective kitchen station:
 *   item override → category default → null (unassigned).
 * Returns a map keyed by menuItemId.
 */
async function resolveStationByMenuItem(menuItemIds: string[]): Promise<Map<string, string | null>> {
  if (menuItemIds.length === 0) return new Map()
  const items = await db.query.menuItems.findMany({
    where: inArray(menuItems.id, menuItemIds),
    columns: { id: true, stationId: true, categoryId: true },
  })
  const catIds = [...new Set(items.map((i) => i.categoryId))]
  const cats = catIds.length
    ? await db.query.categories.findMany({ where: inArray(categories.id, catIds), columns: { id: true, stationId: true } })
    : []
  const catStation = new Map(cats.map((cat) => [cat.id, cat.stationId ?? null]))
  const out = new Map<string, string | null>()
  for (const it of items) out.set(it.id, it.stationId ?? catStation.get(it.categoryId) ?? null)
  return out
}

/**
 * Fire all unsent items on an order as KOTs, split one ticket per kitchen station.
 * Items whose station resolves to null are grouped into a single unassigned KOT,
 * so an outlet with no stations configured produces exactly one KOT — identical to
 * the pre-stations behaviour.
 *
 * Assigns kotId to each item, advances the order to `kot_sent`, and broadcasts one
 * `kot.new` per created KOT. Returns the created KOTs (with their items).
 */
export async function fireKots(opts: { outletId: string; orderId: string; orderSource?: string }) {
  const { outletId, orderId, orderSource } = opts

  const unsent = await db.query.orderItems.findMany({
    where: and(eq(orderItems.orderId, orderId), isNull(orderItems.kotId), eq(orderItems.isVoided, false)),
    with: { modifiers: true },
  })
  if (unsent.length === 0) return []

  const stationByItem = await resolveStationByMenuItem([...new Set(unsent.map((i) => i.menuItemId))])

  // Group unsent items by resolved station; the null station uses the "" bucket key.
  const groups = new Map<string, typeof unsent>()
  for (const it of unsent) {
    const key = (stationByItem.get(it.menuItemId) ?? null) ?? ""
    const arr = groups.get(key) ?? []
    arr.push(it)
    groups.set(key, arr)
  }

  // Station display info (name/colour) for the broadcast payloads.
  const stationIds = [...groups.keys()].filter(Boolean)
  const stationRows = stationIds.length
    ? await db.query.stations.findMany({ where: inArray(stations.id, stationIds), columns: { id: true, name: true, color: true, sortOrder: true } })
    : []
  const stationInfo = new Map(stationRows.map((s) => [s.id, s]))

  // Deterministic ticket order: configured stations first (by sortOrder), unassigned last.
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    return (stationInfo.get(a)?.sortOrder ?? 0) - (stationInfo.get(b)?.sortOrder ?? 0)
  })

  const [agg] = await db.select({ maxNum: max(kots.kotNumber) }).from(kots).where(eq(kots.outletId, outletId))
  let nextNum = (agg?.maxNum ?? 0) + 1

  const created: Array<Record<string, unknown>> = []
  for (const key of orderedKeys) {
    const items = groups.get(key)!
    const stationId = key || null
    const [kot] = await db.insert(kots).values({ outletId, orderId, kotNumber: nextNum++, stationId }).returning()
    if (!kot) continue
    await db.update(orderItems).set({ kotId: kot.id }).where(inArray(orderItems.id, items.map((i) => i.id)))

    const info = stationId ? stationInfo.get(stationId) : undefined
    const payload = { ...kot, orderSource, stationName: info?.name ?? null, stationColor: info?.color ?? null, items }
    broadcastOutlet(outletId, { type: "kot.new", payload: payload as never })
    created.push(payload)
  }

  await db.update(orders).set({ status: "kot_sent", updatedAt: new Date() }).where(eq(orders.id, orderId))
  return created
}
