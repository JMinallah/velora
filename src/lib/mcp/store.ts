import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"

// Global store for MCP transports to survive Next.js API route bundling
declare global {
  var mcpTransports: Map<string, SSEServerTransport> | undefined
  var mcpServers: Map<string, unknown> | undefined
}

export const transports = global.mcpTransports || new Map<string, SSEServerTransport>()
export const servers = global.mcpServers || new Map<string, unknown>()

if (process.env.NODE_ENV !== "production") {
  global.mcpTransports = transports
  global.mcpServers = servers
}
