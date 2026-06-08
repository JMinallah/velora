import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "test", version: "1.0.0" });
console.log("registerTool type:", typeof server.registerTool);
// @ts-expect-error
console.log("registerTool stringified:", server.registerTool.toString());
