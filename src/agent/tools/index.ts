import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import * as missions from "@/domain/missions"
import * as tasks from "@/domain/tasks"
import * as reminders from "@/domain/reminders"
import { isoDate } from "@/domain/schemas"
import type { ToolDeclaration } from "@/agent/providers/types"
import type { ChangeOrigin } from "@/domain/events"

/**
 * Tool contract (docs/03-AGENT-DESIGN.md §2): tools are the ONLY way the
 * agent affects state. Every tool calls the same domain functions the REST
 * API uses — userId is injected by the loop, never model-supplied. Write-tier
 * tools return a receipt line that is shown to the user and stored.
 * Destructive-tier tools never execute inside the loop: they only *propose*
 * (docs/03-AGENT-DESIGN.md §5). The loop parks the call as a pending action;
 * `perform` runs only from the confirmation endpoint, after the user confirms.
 */
export type ToolTier = "read" | "write"

/** Per-turn context the loop passes to every tool. */
/** Per-turn context passed to every tool; confirmedBy is set when the user approved this call on a card. */
export type ToolContext = { turnId: string; confirmedBy?: "user" }

export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  tier: ToolTier
  description: string
  input: S
  execute: (
    userId: string,
    missionId: string,
    args: z.infer<S>,
    ctx: ToolContext
  ) => Promise<{ result: unknown; receipt?: string }>
  /**
   * Write tools: what this call *would* do, for a confirmation card when the
   * mission asks for confirmation before every change (autonomy "confirm-writes").
   */
  describe?: (userId: string, missionId: string, args: z.infer<S>) => Promise<{ summary: string } | { error: string }>
}

/** The origin recorded on events a write tool causes: this turn, this tool, these validated args (FR-TRS-2). */
function byAgent(ctx: ToolContext, tool: string, args: unknown): ChangeOrigin {
  return { actor: "agent", turnId: ctx.turnId, tool, args, ...(ctx.confirmedBy ? { confirmedBy: ctx.confirmedBy } : {}) }
}

function defineTool<S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def
}

const getMissionOverview = defineTool({
  name: "getMissionOverview",
  tier: "read",
  description:
    "Get the current mission: title, status, overview, next step, target date, and task counts by completion. Use before answering any question about the mission's state.",
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
        targetDate: mission.targetDate ?? null,
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
  describe: async (_userId, _missionId, args) => ({
    summary: `Create task "${args.label}"${args.dueDate ? ` (due ${args.dueDate.slice(0, 10)})` : ""}`,
  }),
  execute: async (userId, missionId, args, ctx) => {
    const task = await tasks.createTask(
      userId,
      missionId,
      { ...args, source: "agent" },
      byAgent(ctx, "createTask", args)
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
  describe: async (userId, missionId, args) => {
    const task = await tasks.getTask(userId, missionId, args.taskId)
    if (!task) return { error: "task not found" }
    const changes = [
      args.label !== undefined && `rename to "${args.label}"`,
      args.dueDate !== undefined && (args.dueDate ? `due ${args.dueDate.slice(0, 10)}` : "remove due date"),
      args.priority !== undefined && `${args.priority} priority`,
      args.category !== undefined && `category ${args.category}`,
    ].filter(Boolean)
    return { summary: `Update task "${task.label}": ${changes.join(", ")}` }
  },
  execute: async (userId, missionId, args, ctx) => {
    const { taskId, ...patch } = args
    const updated = await tasks.updateTask(userId, missionId, taskId, patch, byAgent(ctx, "updateTask", args))
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
  describe: async (userId, missionId, args) => {
    const task = await tasks.getTask(userId, missionId, args.taskId)
    if (!task) return { error: "task not found" }
    return { summary: `${args.completed ? "Mark complete" : "Reopen"}: "${task.label}"` }
  },
  execute: async (userId, missionId, args, ctx) => {
    const updated = await tasks.updateTask(
      userId,
      missionId,
      args.taskId,
      { completed: args.completed },
      byAgent(ctx, "completeTask", args)
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
  describe: async (_userId, _missionId, args) => ({
    summary: `Schedule reminder "${args.title}" for ${args.dueAt.slice(0, 16).replace("T", " ")}`,
  }),
  execute: async (userId, missionId, args, ctx) => {
    const reminder = await reminders.createReminder(userId, { ...args, missionId }, byAgent(ctx, "createReminder", args))
    if (!reminder) return { result: { error: "mission not found" } }
    return {
      result: { id: reminder.id, dueAt: reminder.dueAt },
      receipt: `Scheduled reminder "${reminder.title}" for ${reminder.dueAt.slice(0, 16).replace("T", " ")}`,
    }
  },
})

/** Effect of a confirmed destructive action, so the UI can update without refetching. */
export type DestructiveEffect = { kind: "task-deleted"; taskId: string } | { kind: "mission-deleted" }

export type DestructiveToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  tier: "destructive"
  description: string
  input: S
  /** What *would* happen, checked against current data; shown to the user on the confirmation card. */
  describe: (userId: string, missionId: string, args: z.infer<S>) => Promise<{ summary: string } | { error: string }>
  /** Only ever called by the confirmation endpoint, after the user confirmed. */
  perform: (
    userId: string,
    missionId: string,
    args: z.infer<S>,
    origin: ChangeOrigin
  ) => Promise<{ receipt: string; effect: DestructiveEffect } | { error: string }>
}

function defineDestructiveTool<S extends z.ZodTypeAny>(def: DestructiveToolDefinition<S>) {
  return def
}

const deleteTaskTool = defineDestructiveTool({
  name: "deleteTask",
  tier: "destructive",
  description:
    "Propose deleting one task. Nothing is deleted until the user confirms on a card. Get the taskId from listTasks first. Use only when the user clearly asks to delete or remove a task.",
  input: z.object({ taskId: z.string().min(1) }),
  describe: async (userId, missionId, args) => {
    const task = await tasks.getTask(userId, missionId, args.taskId)
    if (!task) return { error: "task not found" }
    return { summary: `Delete task "${task.label}"${task.dueDate ? ` (due ${task.dueDate.slice(0, 10)})` : ""}` }
  },
  perform: async (userId, missionId, args, origin) => {
    const task = await tasks.getTask(userId, missionId, args.taskId)
    if (!task) return { error: "That task no longer exists." }
    await tasks.deleteTask(userId, missionId, args.taskId, origin)
    return { receipt: `Deleted task "${task.label}"`, effect: { kind: "task-deleted", taskId: args.taskId } }
  },
})

const deleteMissionTool = defineDestructiveTool({
  name: "deleteMission",
  tier: "destructive",
  description:
    "Propose deleting this entire mission with all its tasks, messages, documents and reminders. Nothing is deleted until the user confirms on a card. Use only when the user explicitly asks to delete the mission itself.",
  input: z.object({}),
  describe: async (userId, missionId) => {
    const mission = await missions.getMission(userId, missionId)
    if (!mission) return { error: "mission not found" }
    const count = (await tasks.listTasks(userId, missionId)).length
    return { summary: `Delete the whole mission "${mission.title}" and its ${count} task${count === 1 ? "" : "s"}` }
  },
  perform: async (userId, missionId, _args, origin) => {
    const mission = await missions.getMission(userId, missionId)
    if (!mission) return { error: "That mission no longer exists." }
    await missions.deleteMission(userId, missionId, origin)
    return { receipt: `Deleted mission "${mission.title}"`, effect: { kind: "mission-deleted" } }
  },
})

export const destructiveTools: Record<string, DestructiveToolDefinition> = Object.fromEntries(
  [deleteTaskTool, deleteMissionTool].map((t) => [t.name, t as unknown as DestructiveToolDefinition])
)

export const toolRegistry: Record<string, ToolDefinition> = Object.fromEntries(
  [getMissionOverview, listTasksTool, getUpcomingDeadlines, createTask, updateTaskTool, completeTask, createReminderTool].map(
    (t) => [t.name, t as unknown as ToolDefinition]
  )
)

export function toolDeclarations(): ToolDeclaration[] {
  return [...Object.values(toolRegistry), ...Object.values(destructiveTools)].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.input, { $refStrategy: "none" }) as Record<string, unknown>,
  }))
}
