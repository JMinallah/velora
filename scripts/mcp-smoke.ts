import { createVeloraMcpServer, VELORA_MCP_TOOL_NAMES } from "../src/lib/mcp/velora"

const expectedTools = [
  "list_missions",
  "get_mission",
  "create_mission",
  "update_mission",
  "list_tasks",
  "create_task",
  "update_task_status",
  "list_messages",
  "create_message",
  "list_documents",
  "list_events",
]

const server = createVeloraMcpServer()

const missing = expectedTools.filter((tool) => !VELORA_MCP_TOOL_NAMES.includes(tool))

if (missing.length > 0) {
  console.error("Missing MCP tools:", missing.join(", "))
  process.exit(1)
}

if (VELORA_MCP_TOOL_NAMES.length !== expectedTools.length) {
  console.error("Unexpected MCP tool count:", VELORA_MCP_TOOL_NAMES.length)
  process.exit(1)
}

if (!server) {
  console.error("Failed to construct MCP server")
  process.exit(1)
}

console.log(JSON.stringify({ success: true, tools: VELORA_MCP_TOOL_NAMES }, null, 2))