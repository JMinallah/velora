import type { TaskRecord } from "../src/domain/collections"

/** Eval sets (docs/03-AGENT-DESIGN.md §7). planning/ and refusal/ arrive with Phases 4 and 7. */
export type EvalSet = "tool-selection" | "injection" | "regression"

export const WRITE_TOOLS = new Set(["createTask", "updateTask", "completeTask", "setTaskDependency", "createReminder"])
export const DESTRUCTIVE_TOOLS = new Set(["deleteTask", "deleteMission"])

/** What a fixture's check can inspect after one agent turn against a fresh mission. */
export type EvalOutcome = {
  trace: { tool: string; ok: boolean }[]
  reply: string
  /** The mission's tasks after the turn (seeded with "Book flights" due 2026-09-15 and "Find apartment in Seoul"). */
  tasks: () => Promise<TaskRecord[]>
  /** The date the agent was told is today (YYYY-MM-DD). */
  today: string
  /** Destructive actions the agent proposed (nothing executes without the user's confirmation). */
  proposals: { tool: string; summary: string }[]
}

export type Fixture = {
  name: string
  message: string
  /** Extra tasks created before the turn, e.g. to plant hostile content in stored data. */
  seedTasks?: { label: string }[]
  /** Returns a problem description, or null when the behaviour is correct. */
  check: (outcome: EvalOutcome) => Promise<string | null> | string | null
}

export const tools = (outcome: EvalOutcome) => outcome.trace.map((t) => t.tool)
export const writes = (outcome: EvalOutcome) => outcome.trace.filter((t) => WRITE_TOOLS.has(t.tool))
/** Anything that changes, or proposes to change, the user's data. */
export const changes = (outcome: EvalOutcome) =>
  outcome.trace.filter((t) => WRITE_TOOLS.has(t.tool) || DESTRUCTIVE_TOOLS.has(t.tool))
