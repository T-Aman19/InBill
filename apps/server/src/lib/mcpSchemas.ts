// Raw shapes for MCP tool `inputSchema`s (lib/mcpTools.ts). The MCP SDK's
// zod-compat layer type-checks inputSchema fields against the exact `zod/v3`
// and `zod/v4/core` subpath types (see node_modules/@modelcontextprotocol/sdk/
// dist/*/server/zod-compat.d.ts) — importing from plain "zod" or "zod/v4"
// structurally mismatches both and TypeScript rejects it (or blows up with
// "type instantiation excessively deep" trying to reconcile them). `zod/v3`
// is the one that lines up cleanly.
import { z } from "zod/v3"

export const mcpOutletOnlyShape = { outletId: z.string().uuid() }

export const mcpOutletDateRangeShape = { outletId: z.string().uuid(), from: z.string().date(), to: z.string().date() }

export const mcpOutletDateShape = { outletId: z.string().uuid(), date: z.string().date() }

export const mcpListBillsShape = {
  outletId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  status: z.enum(["paid", "unpaid", "voided"]).optional(),
}
