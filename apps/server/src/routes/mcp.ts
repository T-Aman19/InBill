import { Hono } from "hono"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPTransport } from "@hono/mcp"
import type { AppEnv } from "../lib/types.js"
import { requireMcpAuth } from "../middleware/mcpAuth.js"
import { registerMcpTools } from "../lib/mcpTools.js"

export const mcpRouter = new Hono<AppEnv>()

// A fresh McpServer + transport per request — this is a stateless resource
// server (no server-side session affinity between calls from the same client),
// which matters because tools are registered as closures over this specific
// request's grant. Reusing one server instance across requests would leak one
// owner's outlet scope into another's tool calls.
mcpRouter.all("/mcp", requireMcpAuth, async (c) => {
  const grant = c.get("mcpGrant")!
  const server = new McpServer({ name: "inbill", version: "1.0.0" })
  registerMcpTools(server, grant)
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})
