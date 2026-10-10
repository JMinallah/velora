import type { AgentTurn, LlmProvider } from "./providers/types"
import { toolRegistry, toolDeclarations } from "./tools"
import { coordinatorPrompt, PROMPT_VERSION } from "./prompts/coordinator.v1"
import * as missions from "@/domain/missions"
import * as tasks from "@/domain/tasks"

/**
 * The bounded reasoning loop (docs/03-AGENT-DESIGN.md §1.2). Hard bounds make
 * runaway behavior architecturally impossible:
 *   - MAX_STEPS model calls per turn
 *   - MAX_CONSECUTIVE_FAILURES invalid tool calls before forcing an answer
 *   - WALL_CLOCK_MS total budget per turn, enforced on every model call
 *     (a single hung call cannot outlive it), not just between steps
 */
const MAX_STEPS = 8
const MAX_CONSECUTIVE_FAILURES = 3
const WALL_CLOCK_MS = 30_000

export type AgentReceipt = { tool: string; text: string }

export type ToolTraceEntry = { tool: string; ok: boolean }

export type AgentRunResult = {
  reply: string
  receipts: AgentReceipt[]
  /** Every tool call attempted this turn, in order — for evals and logging. */
  trace: ToolTraceEntry[]
  steps: number
  promptVersion: string
}

class TurnDeadlineExceeded extends Error {}

/**
 * Races a model call against the turn's remaining budget. The abandoned call
 * may still complete in the background; that is safe because model calls
 * never write state — only tool execution does, and that happens here.
 */
function withDeadline<T>(promise: Promise<T>, msRemaining: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TurnDeadlineExceeded()), Math.max(0, msRemaining))
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

export async function buildMissionSnapshot(userId: string, missionId: string): Promise<string> {
  const mission = await missions.getMission(userId, missionId)
  if (!mission) return "No mission found."
  const all = await tasks.listTasks(userId, missionId)
  const open = all.filter((t) => !t.completed)
  const soon = open
    .filter((t) => t.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5)

  return [
    `Title: ${mission.title}`,
    mission.subtitle ? `Subtitle: ${mission.subtitle}` : null,
    `Status: ${mission.status}`,
    mission.overview ? `Overview: ${mission.overview}` : null,
    mission.nextStep ? `Next step: ${mission.nextStep}` : null,
    mission.targetDate ? `Target date: ${mission.targetDate.slice(0, 10)}` : null,
    `Tasks: ${all.length} total, ${open.length} open`,
    soon.length > 0
      ? `Nearest deadlines:\n${soon.map((t) => `  - ${t.label} (due ${String(t.dueDate).slice(0, 10)})`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export async function runAgentTurn(input: {
  provider: LlmProvider
  userId: string
  missionId: string
  userMessage: string
  history?: AgentTurn[]
  /** Overrides WALL_CLOCK_MS — for the eval harness, whose calls are paced to free-tier rate limits. */
  wallClockMs?: number
}): Promise<AgentRunResult> {
  const startedAt = Date.now()
  const snapshot = await buildMissionSnapshot(input.userId, input.missionId)
  const system = coordinatorPrompt({
    missionSnapshot: snapshot,
    today: new Date().toISOString().slice(0, 10),
  })

  const turns: AgentTurn[] = [...(input.history ?? []), { role: "user", text: input.userMessage }]
  const receipts: AgentReceipt[] = []
  const trace: ToolTraceEntry[] = []
  const tools = toolDeclarations()

  let consecutiveFailures = 0
  let steps = 0

  const budgetMs = input.wallClockMs ?? WALL_CLOCK_MS
  const remainingMs = () => budgetMs - (Date.now() - startedAt)
  const outOfTime = (): AgentRunResult => ({
    reply: receipts.length
      ? "I ran out of time mid-way, but the actions listed above did complete. Ask me to continue where I left off."
      : "I ran out of time before finishing — please try again.",
    receipts,
    trace,
    steps,
    promptVersion: PROMPT_VERSION,
  })
  const generate = async (callTools: typeof tools) => {
    try {
      return await withDeadline(input.provider.generate({ system, turns, tools: callTools }), remainingMs())
    } catch (error) {
      if (error instanceof TurnDeadlineExceeded) return null
      throw error
    }
  }

  while (steps < MAX_STEPS) {
    steps++
    if (remainingMs() <= 0) return outOfTime()

    const response = await generate(tools)
    if (!response) return outOfTime()

    if (response.toolCalls.length === 0) {
      return {
        reply: response.text || "I don't have a response for that — could you rephrase?",
        receipts,
        trace,
        steps,
        promptVersion: PROMPT_VERSION,
      }
    }

    turns.push({
      role: "assistant",
      text: response.text || undefined,
      toolCalls: response.toolCalls,
      providerParts: response.providerParts,
    })

    for (const call of response.toolCalls) {
      const tool = toolRegistry[call.name]
      if (!tool) {
        consecutiveFailures++
        trace.push({ tool: call.name, ok: false })
        turns.push({ role: "tool", name: call.name, callId: call.id, result: { error: `unknown tool "${call.name}"` } })
        continue
      }

      const parsed = tool.input.safeParse(call.args ?? {})
      if (!parsed.success) {
        consecutiveFailures++
        trace.push({ tool: call.name, ok: false })
        turns.push({
          role: "tool",
          name: call.name,
          callId: call.id,
          result: { error: "invalid arguments", issues: parsed.error.issues },
        })
        continue
      }

      try {
        const { result, receipt } = await tool.execute(input.userId, input.missionId, parsed.data)
        consecutiveFailures = 0
        trace.push({ tool: call.name, ok: true })
        if (receipt) receipts.push({ tool: tool.name, text: receipt })
        turns.push({ role: "tool", name: call.name, callId: call.id, result })
      } catch (error) {
        consecutiveFailures++
        trace.push({ tool: call.name, ok: false })
        turns.push({
          role: "tool",
          name: call.name,
          callId: call.id,
          result: { error: error instanceof Error ? error.message : "tool execution failed" },
        })
      }
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      turns.push({
        role: "user",
        text: "SYSTEM NOTE: several tool calls failed. Stop calling tools and answer the user with what you have, stating plainly what you could not complete.",
      })
      const final = await generate([])
      return {
        reply: final?.text || "I couldn't complete that — something kept failing. Please try again.",
        receipts,
        trace,
        steps: steps + 1,
        promptVersion: PROMPT_VERSION,
      }
    }
  }

  return {
    reply: receipts.length
      ? "I reached my step limit for one turn, but the actions listed above did complete. Ask me to continue."
      : "That took more steps than I'm allowed in one turn. Try breaking the request into smaller pieces.",
    receipts,
    trace,
    steps,
    promptVersion: PROMPT_VERSION,
  }
}
