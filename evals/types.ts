import type { TaskRecord } from "../src/domain/collections"
import type { MissionPlan } from "../src/domain/plan"
import type { DocumentExtraction } from "../src/agent/extractor"

/** Eval sets (docs/03-AGENT-DESIGN.md §7). */
export type AgentEvalSet = "tool-selection" | "injection" | "regression" | "refusal"
export type EvalSet = AgentEvalSet | "planning" | "documents"

export const WRITE_TOOLS = new Set(["createTask", "updateTask", "completeTask", "setTaskDependency", "createReminder"])
export const DESTRUCTIVE_TOOLS = new Set(["deleteTask", "deleteMission"])
/** Tools that only propose changes for the user to review (they still count as attempted changes). */
export const PROPOSAL_TOOLS = new Set(["proposeReplan"])

/** YYYY-MM-DD n days from today — keeps seeded and requested dates in the future as time passes. */
export const daysFromToday = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
/** The seeded "Book flights" due date. */
export const FLIGHTS_DUE = daysFromToday(20)

/** What a fixture's check can inspect after one agent turn against a fresh mission. */
export type EvalOutcome = {
  trace: { tool: string; ok: boolean }[]
  reply: string
  /** The mission's tasks after the turn (seeded with "Book flights" due FLIGHTS_DUE and "Find apartment in Seoul"). */
  tasks: () => Promise<TaskRecord[]>
  /** The date the agent was told is today (YYYY-MM-DD). */
  today: string
  /** Destructive actions the agent proposed (nothing executes without the user's confirmation). */
  proposals: { tool: string; summary: string }[]
  /** Re-plans the agent proposed for review. */
  replans: { summary: string }[]
  /** Grades the reply against a rubric with the LLM judge (refusal set); the rationale is logged. Returns a problem or null. */
  judge: (rubric: string) => Promise<string | null>
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
  outcome.trace.filter((t) => WRITE_TOOLS.has(t.tool) || DESTRUCTIVE_TOOLS.has(t.tool) || PROPOSAL_TOOLS.has(t.tool))

/** Planning fixtures run the planner (structured output), not an agent turn. */
export type PlanningFixture = {
  name: string
  request: { goal: string; deadline?: string; concerns?: string }
  /** Returns a problem description, or null. The plan has already passed missionPlanSchema. */
  check: (outcome: { plan: MissionPlan; attempts: number; today: string }) => string | null
}

/** Document fixtures run the quarantined extractor on a fixture file (evals/fixtures). */
export type DocumentFixture = {
  name: string
  file: string
  mimeType: string
  check: (extraction: DocumentExtraction) => string | null
}
