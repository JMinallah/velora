import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import * as missions from "@/domain/missions"
import * as tasks from "@/domain/tasks"
import * as reminders from "@/domain/reminders"
import { isoDate } from "@/domain/schemas"
import type { ToolDeclaration } from "@/agent/providers/types"

/**
 * Tool contract (docs/03-AGENT-DESIGN.md §2): tools are the ONLY way the
 * agent affects state. Every tool calls the same domain functions the REST
 * API uses — userId is injected by the loop, never model-supplied. Write-tier
 * tools return a receipt line that is shown to the user and stored.
 * No destructive-tier tools exist yet; they arrive with the server-side
 * confirmation flow in Phase 3.
 */
export type ToolTier = "read" | "write"

export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  tier: ToolTier
  description: string
  input: S
  execute: (
    userId: string,
    missionId: string,
    args: z.infer<S>
  ) => Promise<{ result: unknown; receipt?: string }>
}

function defineTool<S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def
}

const getMissionOverview = defineTool({
  name: "getMissionOverview",
  tier: "read",
  description:
    "Get the current mission: title, status, overview, next step, and task counts by completion. Use before answering any question about the mission's state.",
  input: z.object({}),
  execute: async (userId, missionId) => {
    const mission = await missions.getMission(userId, missionId)
    if (!mission) return { result: { error: "mission not found" } }
    const all = await tasks.listTasks(userId, missionId)
    return {
      result: {
        title: mission.title,
        subtitle: mission.subtitle,
        status: mission.status,
        overview: mission.overview,
        nextStep: mission.nextStep,
        tasksTotal: all.length,
        tasksCompleted: all.filter((t) => t.completed).length,
      },
    }
  },
})

const listTasksTool = defineTool({
  name: "listTasks",
  tier: "read",
  description:
    "List the mission's tasks with id, label, category, completed, dueDate, priority. Use before referring to, updating, or reasoning about any task.",
  input: z.object({
    onlyOpen: z.boolean().optional().describe("When true, return only incomplete tasks"),
  }),
  execute: async (userId, missionId, args) => {
    const all = await tasks.listTasks(userId, missionId)
    const filtered = args.onlyOpen ? all.filter((t) => !t.completed) : all
    return {
      result: filtered.map((t) => ({
        id: t.id,
        label: t.label,
        category: t.category,
        completed: t.completed,
        dueDate: t.dueDate,
        priority: t.priority,
      })),
    }
  },
})

const getUpcomingDeadlines = defineTool({
  name: "getUpcomingDeadlines",
  tier: "read",
  description: "Get open tasks with due dates in the next N days (default 14), soonest first.",
  input: z.object({
    days: z.number().int().min(1).max(365).optional(),
  }),
  execute: async (userId, missionId, args) => {
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + (args.days ?? 14))
    const all = await tasks.listTasks(userId, missionId)
    const due = all
      .filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) <= horizon)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    return {
      result: due.map((t) => ({ id: t.id, label: t.label, dueDate: t.dueDate, priority: t.priority })),
    }
  },
})

const createTask = defineTool({
  name: "createTask",
  tier: "write",
  description: "Create a new task in this mission.",
  input: z.object({
    label: z.string().min(1).max(300),
    category: z.string().max(100).optional(),
    dueDate: isoDate.optional().describe("ISO date, e.g. 2026-09-12"),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }),
  execute: async (userId, missionId, args) => {
    const task = await tasks.createTask(
      userId,
      missionId,
      { ...args, source: "agent" },
      "agent"
    )
    if (!task) return { result: { error: "mission not found" } }
    return {
      result: { id: task.id, label: task.label, dueDate: task.dueDate },
      receipt: `Created task "${task.label}"${task.dueDate ? ` — due ${task.dueDate.slice(0, 10)}` : ""}`,
    }
  },
})

const updateTaskTool = defineTool({
  name: "updateTask",
  tier: "write",
  description:
    "Update an existing task's label, category, due date, or priority. Get the taskId from listTasks first.",
  input: z
    .object({
      taskId: z.string().min(1),
      label: z.string().min(1).max(300).optional(),
      category: z.string().max(100).optional(),
      dueDate: isoDate.nullable().optional().describe("ISO date, e.g. 2026-09-12; null clears it"),
      priority: z.enum(["low", "medium", "high"]).optional(),
    })
    // An update with nothing to change would still emit a "Updated task" receipt.
    .refine((a) => [a.label, a.category, a.dueDate, a.priority].some((v) => v !== undefined), {
      message: "provide at least one field to change",
    }),
  execute: async (userId, missionId, args) => {
    const { taskId, ...patch } = args
    const updated = await tasks.updateTask(userId, missionId, taskId, patch, "agent")
    if (!updated) return { result: { error: "task not found" } }
    return {
      result: { id: updated.id, label: updated.label, dueDate: updated.dueDate },
      receipt: `Updated task "${updated.label}"`,
    }
  },
})

const completeTask = defineTool({
  name: "completeTask",
  tier: "write",
  description: "Mark a task complete (or reopen it). Get the taskId from listTasks first.",
  input: z.object({
    taskId: z.string().min(1),
    completed: z.boolean(),
  }),
  execute: async (userId, missionId, args) => {
    const updated = await tasks.updateTask(
      userId,
      missionId,
      args.taskId,
      { completed: args.completed },
      "agent"
    )
    if (!updated) return { result: { error: "task not found" } }
    return {
      result: { id: updated.id, completed: updated.completed },
      receipt: `${args.completed ? "Completed" : "Reopened"} task "${updated.label}"`,
    }
  },
})

const createReminderTool = defineTool({
  name: "createReminder",
  tier: "write",
  description: "Schedule an in-app reminder for this mission at a specific time.",
  input: z.object({
    title: z.string().min(1).max(200),
    dueAt: isoDate.describe("ISO datetime for when the reminder should fire, e.g. 2026-09-12T09:00:00Z"),
    details: z.string().max(500).optional(),
    taskId: z.string().optional(),
  }),
  execute: async (userId, missionId, args) => {
    const reminder = await reminders.createReminder(userId, { ...args, missionId }, "agent")
    if (!reminder) return { result: { error: "mission not found" } }
    return {
      result: { id: reminder.id, dueAt: reminder.dueAt },
      receipt: `Scheduled reminder "${reminder.title}" for ${reminder.dueAt.slice(0, 16).replace("T", " ")}`,
    }
  },
})

export const toolRegistry: Record<string, ToolDefinition> = Object.fromEntries(
  [getMissionOverview, listTasksTool, getUpcomingDeadlines, createTask, updateTaskTool, completeTask, createReminderTool].map(
    (t) => [t.name, t as unknown as ToolDefinition]
  )
)

export function toolDeclarations(): ToolDeclaration[] {
  return Object.values(toolRegistry).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.input, { target: "openApi3" }) as Record<string, unknown>,
  }))
}
