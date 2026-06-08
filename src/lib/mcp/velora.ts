import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

import { createMessage, listMessagesForMission } from "@/lib/mongodb/messages"
import { createMission, getMission, listMissions, updateMission, searchMissions, deleteMission } from "@/lib/mongodb/missions"
import { listDocumentsForMission } from "@/lib/mongodb/documents"
import { listEventsForMission } from "@/lib/mongodb/events"
import { createTask, listTasksForMission, updateTaskStatus, deleteTask } from "@/lib/mongodb/tasks"

type McpToolResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent: {
    success: boolean
    data?: unknown
    error?: string
  }
  isError?: boolean
}

type ToolSpec = {
  name: string
  description: string
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
  }
  inputSchema?: z.ZodRawShape
  run: (input: Record<string, unknown>) => Promise<McpToolResult>
}

const textResult = (payload: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: { success: true, data: payload },
})

const errorResult = (message: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ success: false, error: message }, null, 2) }],
  structuredContent: { success: false, error: message },
  isError: true,
})

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "")

const readOptionalString = (value: unknown): string | undefined => {
  const text = readString(value)
  return text ? text : undefined
}

const readBoolean = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined)

const readNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null
  return readOptionalString(value)
}

const buildTools = (): ToolSpec[] => [
  {
    name: "list_missions",
    description: "List missions stored in MongoDB.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {},
    run: async () => textResult(await listMissions()),
  },
  {
    name: "search_missions",
    description: "Search for missions by keyword in title, subtitle, or overview.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { query: z.string().min(1).describe("Search query") },
    run: async (input) => {
      const query = readString(input.query)
      if (!query) return errorResult("query is required")
      return textResult(await searchMissions(query))
    },
  },
  {
    name: "get_mission",
    description: "Fetch a single mission by id.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      const mission = await getMission(missionId)
      if (!mission) return errorResult(`Mission not found: ${missionId}`)
      return textResult(mission)
    },
  },
  {
    name: "create_mission",
    description: "Create a new mission record.",
    annotations: { destructiveHint: false, idempotentHint: false },
    inputSchema: {
      title: z.string().min(1).describe("Mission title"),
      overview: z.string().min(1).describe("Mission overview"),
      subtitle: z.string().optional(),
      nextStep: z.string().optional(),
      source: z.enum(["onboarding", "agent", "manual"]).optional(),
    },
    run: async (input) => {
      const title = readString(input.title)
      const overview = readString(input.overview)
      if (!title || !overview) return errorResult("title and overview are required")

      return textResult(
        await createMission({
          title,
          overview,
          subtitle: readOptionalString(input.subtitle),
          nextStep: readOptionalString(input.nextStep) ?? "",
          source: (input.source as "onboarding" | "agent" | "manual") ?? "agent",
        })
      )
    },
  },
  {
    name: "update_mission",
    description: "Update a mission record.",
    annotations: { idempotentHint: true },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      phase: z.string().optional(),
      status: z.enum(["On track", "Watch", "At risk"]).optional(),
      overview: z.string().optional(),
      nextStep: z.string().optional(),
      source: z.enum(["onboarding", "agent", "manual"]).optional(),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")

      const updated = await updateMission(missionId, {
        title: readOptionalString(input.title),
        subtitle: readOptionalString(input.subtitle),
        phase: readOptionalString(input.phase),
        status: input.status as "On track" | "Watch" | "At risk" | undefined,
        overview: readOptionalString(input.overview),
        nextStep: readOptionalString(input.nextStep),
        source: (input.source as "onboarding" | "agent" | "manual") ?? undefined,
      })

      if (!updated) return errorResult(`Mission not found: ${missionId}`)
      return textResult(updated)
    },
  },
  {
    name: "delete_mission",
    description: "Delete a mission record.",
    annotations: { destructiveHint: true, idempotentHint: true },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")

      const deleted = await deleteMission(missionId)
      if (!deleted) return errorResult(`Mission not found: ${missionId}`)
      return textResult({ success: true, message: `Mission ${missionId} deleted successfully` })
    },
  },
  {
    name: "list_tasks",
    description: "List tasks for a mission.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      return textResult(await listTasksForMission(missionId))
    },
  },
  {
    name: "summarize_progress",
    description: "Get a summary of task progress for a mission (total, completed, pending, percentage).",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      const tasks = await listTasksForMission(missionId)
      const total = tasks.length
      const completed = tasks.filter(t => t.completed).length
      const pending = total - completed
      const progressPercentage = total === 0 ? 0 : Math.round((completed / total) * 100)
      return textResult({ total, completed, pending, progressPercentage })
    },
  },
  {
    name: "create_task",
    description: "Create a task for a mission.",
    annotations: { destructiveHint: false, idempotentHint: false },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
      label: z.string().min(1).describe("Task label"),
      category: z.string().optional(),
      dueDate: z.union([z.string(), z.null()]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      source: z.enum(["agent", "user", "import"]).optional(),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      const label = readString(input.label)
      if (!missionId || !label) return errorResult("missionId and label are required")

      return textResult(
        await createTask({
          missionId,
          label,
          category: readOptionalString(input.category) ?? "General",
          dueDate: readNullableString(input.dueDate),
          priority: (input.priority as "low" | "medium" | "high") ?? "medium",
          source: (input.source as "agent" | "user" | "import") ?? "agent",
        })
      )
    },
  },
  {
    name: "update_task_status",
    description: "Update whether a task is completed.",
    annotations: { idempotentHint: true },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
      taskId: z.string().min(1).describe("Task id"),
      completed: z.boolean().describe("Completed state"),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      const taskId = readString(input.taskId)
      const completed = readBoolean(input.completed)
      if (!missionId || !taskId || typeof completed !== "boolean") {
        return errorResult("missionId, taskId, and completed are required")
      }

      const updated = await updateTaskStatus(missionId, taskId, completed)
      if (!updated) return errorResult(`Task not found: ${taskId}`)
      return textResult(updated)
    },
  },
  {
    name: "delete_task",
    description: "Delete a task from a mission.",
    annotations: { destructiveHint: true, idempotentHint: true },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
      taskId: z.string().min(1).describe("Task id"),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      const taskId = readString(input.taskId)
      if (!missionId || !taskId) return errorResult("missionId and taskId are required")

      const deleted = await deleteTask(missionId, taskId)
      if (!deleted) return errorResult(`Task not found: ${taskId}`)
      return textResult({ success: true, message: `Task ${taskId} deleted successfully` })
    },
  },
  {
    name: "list_messages",
    description: "List messages for a mission.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      return textResult(await listMessagesForMission(missionId))
    },
  },
  {
    name: "create_message",
    description: "Create a message for a mission.",
    annotations: { destructiveHint: false, idempotentHint: false },
    inputSchema: {
      missionId: z.string().min(1).describe("Mission id"),
      text: z.string().min(1).describe("Message text"),
      type: z.enum(["suggestion", "alert", "update", "reasoning", "user"]).optional(),
      source: z.enum(["agent", "user", "system"]).optional(),
    },
    run: async (input) => {
      const missionId = readString(input.missionId)
      const text = readString(input.text)
      if (!missionId || !text) return errorResult("missionId and text are required")

      return textResult(
        await createMessage({
          missionId,
          text,
          type: (input.type as "suggestion" | "alert" | "update" | "reasoning" | "user") ?? "reasoning",
          source: (input.source as "agent" | "user" | "system") ?? "agent",
        })
      )
    },
  },
  {
    name: "list_documents",
    description: "List documents for a mission.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      return textResult(await listDocumentsForMission(missionId))
    },
  },
  {
    name: "list_events",
    description: "List mission events from MongoDB.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: { missionId: z.string().min(1).describe("Mission id") },
    run: async (input) => {
      const missionId = readString(input.missionId)
      if (!missionId) return errorResult("missionId is required")
      return textResult(await listEventsForMission(missionId))
    },
  },
]

export const VELORA_MCP_TOOL_NAMES = buildTools().map((tool) => tool.name)

export function createVeloraMcpServer() {
  const server = new McpServer({ name: "velora-mongodb", version: "1.0.0" }, { capabilities: { logging: {} } })
  for (const tool of buildTools()) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema || {},
      async (input: Record<string, unknown>) => tool.run(input)
    )
  }

  return server
}

export async function runVeloraMcpStdio() {
  const server = createVeloraMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  return { server, transport }
}