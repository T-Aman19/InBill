import { z } from "zod"
import type { Order } from "./order.js"
import type { Kot } from "./order.js"
import type { Table } from "./table.js"

export const wsEventTypeSchema = z.enum([
  "order.created",
  "order.updated",
  "order.cancelled",
  "kot.new",
  "kot.acknowledged",
  "kot.done",
  "table.status",
  "item.availability",
  "sync.status",
  "payment.confirmed",
  "inventory.low_stock",
])

export type WsEventType = z.infer<typeof wsEventTypeSchema>

export type WsEvent =
  | { type: "order.created"; payload: Order }
  | { type: "order.updated"; payload: Order }
  | { type: "order.cancelled"; payload: { orderId: string } }
  | { type: "kot.new"; payload: Kot }
  | { type: "kot.acknowledged"; payload: { kotId: string } }
  | { type: "kot.done"; payload: { kotId: string } }
  | { type: "table.status"; payload: Pick<Table, "id" | "status" | "currentOrderId"> }
  | { type: "item.availability"; payload: { itemId: string; isAvailable: boolean } }
  | { type: "sync.status"; payload: { status: "synced" | "pending" | "offline"; pendingCount: number } }
  | { type: "payment.confirmed"; payload: { billId: string; paymentId: string } }
  | { type: "inventory.low_stock"; payload: { ingredientId: string; name: string; currentStock: string; unit: string; reorderLevel: string } }
