import { runVeloraMcpStdio } from "../src/lib/mcp/velora"

runVeloraMcpStdio().catch((error) => {
  console.error("Velora MCP server failed to start:", error)
  process.exit(1)
})