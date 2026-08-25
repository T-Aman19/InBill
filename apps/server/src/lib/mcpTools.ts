// The MCP tool catalog — 13 read-only tools exposed at /mcp. Every tool is
// annotated { title, readOnlyHint: true, destructiveHint: false } (no mutating
// tools yet — see the "deliberately out of scope" note in the MCP plan) and
// takes an explicit outletId that's re-verified against the caller's grant
// before any query runs, mirroring the eq(outlets.ownerId, ownerId) re-check
// convention already used throughout routes/owner.ts.
//
// The `shape as ZodRawShape` casts below are a deliberate, narrow workaround:
// under this project's exactOptionalPropertyTypes, TypeScript's structural
// check of a zod/v3 shape against the SDK's AnySchema = z3.ZodTypeAny |
// z4.$ZodType union blows up with "type instantiation excessively deep" —
// confirmed in isolation, and confirmed to go away only with
// exactOptionalPropertyTypes off project-wide, which isn't worth the risk of
// flipping for the rest of the codebase. The shapes ARE valid ZodRawShapes at
// runtime; the cast only skips a compile-time re-verification of that fact,
// and each callback below is still explicitly, correctly typed by hand.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { eq, and, inArray, gte, lte } from "drizzle-orm"
import { mcpOutletOnlyShape, mcpOutletDateRangeShape, mcpOutletDateShape, mcpListBillsShape } from "./mcpSchemas.js"
import type { McpGrant } from "./types.js"
import { db } from "../db/index.js"
import { outlets, orders, tables, floors, categories, menuItems, itemVariants, modifierGroups, modifiers, taxConfigs, menuSchedules, stations, bills } from "../db/schema/index.js"
import { dayStart, dayEnd } from "./dateRange.js"
import {
  getSalesSummary, getTopItems, getTopCategories, getGstSummary,
  getFoodCost, getHourlySales, getVoidedItems, getStaffPerformance,
} from "./reportQueries.js"

/* eslint-disable @typescript-eslint/no-explicit-any */
const outletOnlyShape = mcpOutletOnlyShape as any
const outletDateRangeShape = mcpOutletDateRangeShape as any
const outletDateShape = mcpOutletDateShape as any
const listBillsShape = mcpListBillsShape as any
/* eslint-enable @typescript-eslint/no-explicit-any */

type OutletOnlyArgs = { outletId: string }
type OutletDateRangeArgs = { outletId: string; from: string; to: string }
type OutletDateArgs = { outletId: string; date: string }
type ListBillsArgs = { outletId: string; from: string; to: string; status?: "paid" | "unpaid" | "voided" }

function textResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true }
}

function readOnlyAnn(title: string) {
  return { title, readOnlyHint: true, destructiveHint: false }
}

class OutletAccessError extends Error {}

async function assertOutletAccess(grant: McpGrant, outletId: string): Promise<void> {
  if (grant.outletIds && !grant.outletIds.includes(outletId)) {
    throw new OutletAccessError("This connection was not granted access to that outlet")
  }
  const owned = await db.query.outlets.findFirst({ where: and(eq(outlets.id, outletId), eq(outlets.ownerId, grant.ownerId)), columns: { id: true } })
  if (!owned) throw new OutletAccessError("Outlet not found")
}

// Runs a tool query after checking outlet access, uniformly turning an access
// failure into an isError tool result instead of a thrown exception.
async function guarded(grant: McpGrant, outletId: string, run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    await assertOutletAccess(grant, outletId)
    return textResult(await run())
  } catch (err) {
    if (err instanceof OutletAccessError) return errorResult(err.message)
    throw err
  }
}

export function registerMcpTools(server: McpServer, grant: McpGrant): void {
  server.tool(
    "list_outlets",
    "List every outlet this account can access.",
    readOnlyAnn("List outlets"),
    async () => {
      const where = grant.outletIds ? and(eq(outlets.ownerId, grant.ownerId), inArray(outlets.id, grant.outletIds)) : eq(outlets.ownerId, grant.ownerId)
      const rows = await db.query.outlets.findMany({ where, columns: { id: true, name: true, address: true, timezone: true, currency: true } })
      return textResult(rows)
    },
  )

  server.tool(
    "get_sales_summary",
    "Bill count, revenue, tax, discount, and payment-mode breakdown for a date range.",
    outletDateRangeShape,
    readOnlyAnn("Get sales summary"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getSalesSummary(outletId, from, to)),
  )

  server.tool(
    "get_top_items",
    "Menu items sold in a date range, ranked by revenue.",
    outletDateRangeShape,
    readOnlyAnn("Get top-selling items"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getTopItems(outletId, from, to)),
  )

  server.tool(
    "get_top_categories",
    "Menu categories sold in a date range, ranked by revenue.",
    outletDateRangeShape,
    readOnlyAnn("Get top-selling categories"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getTopCategories(outletId, from, to)),
  )

  server.tool(
    "get_gst_summary",
    "GSTR-1-style CGST/SGST breakdown by tax rate for a date range.",
    outletDateRangeShape,
    readOnlyAnn("Get GST summary"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getGstSummary(outletId, from, to)),
  )

  server.tool(
    "get_food_cost",
    "Revenue, cost of goods sold, and food-cost % for a date range, broken down by ingredient.",
    outletDateRangeShape,
    readOnlyAnn("Get food cost"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getFoodCost(outletId, from, to)),
  )

  server.tool(
    "get_hourly_sales",
    "Revenue and bill count by hour of day for a single date.",
    outletDateShape,
    readOnlyAnn("Get hourly sales"),
    async ({ outletId, date }: OutletDateArgs) => guarded(grant, outletId, () => getHourlySales(outletId, date)),
  )

  server.tool(
    "get_staff_performance",
    "Bill count and revenue per staff member for a date range.",
    outletDateRangeShape,
    readOnlyAnn("Get staff performance"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getStaffPerformance(outletId, from, to)),
  )

  server.tool(
    "get_voided_items",
    "Items voided in a date range, with who voided them.",
    outletDateRangeShape,
    readOnlyAnn("Get voided items"),
    async ({ outletId, from, to }: OutletDateRangeArgs) => guarded(grant, outletId, () => getVoidedItems(outletId, from, to)),
  )

  server.tool(
    "list_open_orders",
    "Orders currently open (not yet billed) at an outlet, with their items.",
    outletOnlyShape,
    readOnlyAnn("List open orders"),
    async ({ outletId }: OutletOnlyArgs) => guarded(grant, outletId, () =>
      db.query.orders.findMany({
        where: and(eq(orders.outletId, outletId), eq(orders.status, "open")),
        with: { items: { with: { modifiers: true } } },
      })),
  )

  server.tool(
    "get_floor_status",
    "Live status of every table (free, occupied, billed) at an outlet.",
    outletOnlyShape,
    readOnlyAnn("Get floor status"),
    async ({ outletId }: OutletOnlyArgs) => guarded(grant, outletId, async () => {
      const [floorList, tableList] = await Promise.all([
        db.query.floors.findMany({ where: eq(floors.outletId, outletId) }),
        db.query.tables.findMany({ where: eq(tables.outletId, outletId) }),
      ])
      return { floors: floorList, tables: tableList }
    }),
  )

  server.tool(
    "get_menu",
    "Full menu: categories, items, variants, modifiers, and tax config for an outlet.",
    outletOnlyShape,
    readOnlyAnn("Get menu"),
    async ({ outletId }: OutletOnlyArgs) => guarded(grant, outletId, async () => {
      const [cats, items, groups, taxList, scheduleList, stationList] = await Promise.all([
        db.query.categories.findMany({ where: eq(categories.outletId, outletId) }),
        db.query.menuItems.findMany({ where: eq(menuItems.outletId, outletId) }),
        db.query.modifierGroups.findMany({ where: eq(modifierGroups.outletId, outletId) }),
        db.query.taxConfigs.findMany({ where: eq(taxConfigs.outletId, outletId) }),
        db.query.menuSchedules.findMany({ where: eq(menuSchedules.outletId, outletId) }),
        db.query.stations.findMany({ where: and(eq(stations.outletId, outletId), eq(stations.isActive, true)) }),
      ])
      const itemIds = items.map((i) => i.id)
      const groupIds = groups.map((g) => g.id)
      const [variants, mods] = await Promise.all([
        itemIds.length ? db.query.itemVariants.findMany({ where: (v, { inArray: ia }) => ia(v.itemId, itemIds) }) : Promise.resolve([]),
        groupIds.length ? db.query.modifiers.findMany({ where: (m, { inArray: ia }) => ia(m.groupId, groupIds) }) : Promise.resolve([]),
      ])
      return { categories: cats, items, variants, modifierGroups: groups, modifiers: mods, taxConfigs: taxList, schedules: scheduleList, stations: stationList }
    }),
  )

  server.tool(
    "list_bills",
    "Bills in a date range, optionally filtered by payment status.",
    listBillsShape,
    readOnlyAnn("List bills"),
    async ({ outletId, from, to, status }: ListBillsArgs) => guarded(grant, outletId, async () => {
      const rows = await db.query.bills.findMany({
        where: and(
          eq(bills.outletId, outletId),
          gte(bills.createdAt, dayStart(from)),
          lte(bills.createdAt, dayEnd(to)),
          status === "voided" ? eq(bills.isVoided, true) : eq(bills.isVoided, false),
          status === "paid" ? eq(bills.isPaid, true) : undefined,
          status === "unpaid" ? eq(bills.isPaid, false) : undefined,
        ),
        with: { payments: { columns: { mode: true, amount: true } } },
        orderBy: (b, { desc }) => [desc(b.createdAt)],
        limit: 200,
      })
      return rows.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        createdAt: b.createdAt,
        total: b.total,
        isPaid: b.isPaid,
        isVoided: b.isVoided,
        paymentModes: [...new Set(b.payments.map((p) => p.mode))],
      }))
    }),
  )
}
