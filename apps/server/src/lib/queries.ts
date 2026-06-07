import { eq, inArray } from "drizzle-orm"
import { db } from "../db/index.js"
import { orders, kots, bills } from "../db/schema/index.js"

export async function fetchOrderWithKotStatus(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: { with: { modifiers: true } } },
  })
  if (!order) return null

  const kotIds = [...new Set(order.items.map((i) => i.kotId).filter((id): id is string => id !== null))]

  let kotStatusMap: Record<string, string> = {}
  if (kotIds.length > 0) {
    const kotList = await db.query.kots.findMany({ where: inArray(kots.id, kotIds) })
    kotStatusMap = Object.fromEntries(kotList.map((k) => [k.id, k.status]))
  }

  // Include the active bill ID so the order screen can navigate to payment
  const bill = order.status === "billed"
    ? await db.query.bills.findFirst({ where: eq(bills.orderId, orderId) })
    : null

  return {
    ...order,
    billId: bill?.id ?? null,
    billIsPaid: bill?.isPaid ?? null,
    items: order.items.map((item) => ({
      ...item,
      kotStatus: item.kotId ? (kotStatusMap[item.kotId] ?? null) : null,
    })),
  }
}
