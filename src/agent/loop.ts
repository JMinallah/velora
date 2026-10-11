import { randomUUID } from "node:crypto"
import type { AgentTurn, LlmProvider } from "./providers/types"
import { toolRegistry, toolDeclarations, destructiveTools } from "./tools"
import { coordinatorPrompt, PROMPT_VERSION } from "./prompts/coordinator.v2"
import * as missions from "@/domain/missions"
import * as tasks from "@/domain/tasks"
import { computeRisk, RISK_LABEL } from "@/domain/risk"
import { proposeAction } from "@/domain/pendingActions"
import type { ProposedActionView } from "@/types"

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

/** Progress while a turn runs, for streaming to the user (FR-AGT-1). */
export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "receipt"; receipt: AgentReceipt }
  | { type: "confirmation"; action: ProposedActionView }

/** At most this many destructive proposals per turn ("clean up everything" must not flood the user). */
const MAX_PROPOSALS_PER_TURN = 10

export type AgentRunResult = {
  reply: string
  receipts: AgentReceipt[]
  /** Every tool call attempted this turn, in order — for evals and logging. */
  trace: ToolTraceEntry[]
  steps: number
  promptVersion: string
  /** Stamped on every event this turn's tools emitted (FR-TRS-2). */
  turnId: string
  /** Destructive actions proposed this turn, awaiting the user's confirmation (03-AGENT-DESIGN §5). */
  proposals: ProposedActionView[]
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
  const risk = computeRisk({ targetDate: mission.targetDate, tasks: all, today: new Date().toISOString().slice(0, 10) })
  const soon = open
    .filter((t) => t.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5)

  return [
    `Title: ${mission.title}`,
    mission.subtitle ? `Subtitle: ${mission.subtitle}` : null,
    `Risk: ${RISK_LABEL[risk.level]} — ${risk.reasons.join(" ")}`,
    mission.overview ? `Overview: ${mission.overview}` : null,
    mission.nextStep ? `Next step: ${mission.nextStep}` : null,
    mission.targetDate ? `Target date: ${mission.targetDate.slice(0, 10)}` : null,
    mission.settings?.autonomy === "confirm-writes"
      ? "Velora permissions: the user asked to confirm every change before it is applied — your changes will be shown to them as proposals."
      : null,
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
  /** Links this turn's messages and events; generated when not given. */
  turnId?: string
  /** Receives text as it is generated and receipts as tools complete; enables provider streaming. */
  onEvent?: (event: AgentStreamEvent) => void
}): Promise<AgentRunResult> {
  const startedAt = Date.now()
  const turnId = input.turnId ?? randomUUID()
  // FR-TRS-4: with "confirm-writes", every write tool proposes like a destructive one.
  const askFirst = (await missions.getMission(input.userId, input.missionId))?.settings?.autonomy === "confirm-writes"
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

  // Text the model wrote before calling tools ("Let me check your tasks…").
  // It may already have been streamed to the user, so it stays part of the
  // reply: what was shown while streaming always matches what is stored.
  const preambles: string[] = []
  const proposals: ProposedActionView[] = []
  const finish = (finalText: string, stepCount = steps): AgentRunResult => ({
    reply: [...preambles, finalText].filter(Boolean).join("\n\n"),
    receipts,
    trace,
    steps: stepCount,
    promptVersion: PROMPT_VERSION,
    turnId,
    proposals,
  })
  const outOfTime = () =>
    finish(
      receipts.length
        ? "I ran out of time mid-way, but the actions listed above did complete. Ask me to continue where I left off."
        : "I ran out of time before finishing — please try again."
    )

  const generate = async (callTools: typeof tools) => {
    const ms = remainingMs()
    // Abort the request itself at the deadline (providers that honour the
    // signal stop the network call); withDeadline covers providers that don't.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(0, ms))
    const request = { system, turns, tools: callTools, signal: controller.signal }
    const onEvent = input.onEvent
    try {
      const call =
        onEvent && input.provider.generateStream
          ? input.provider.generateStream({ ...request, onText: (delta) => onEvent({ type: "text", delta }) })
          : input.provider.generate(request)
      return await withDeadline(call, ms)
    } catch (error) {
      if (error instanceof TurnDeadlineExceeded || controller.signal.aborted) return null
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  while (steps < MAX_STEPS) {
    steps++
    if (remainingMs() <= 0) return outOfTime()

    const response = await generate(tools)
    if (!response) return outOfTime()

    if (response.toolCalls.length === 0) {
      return finish(response.text || "I don't have a response for that — could you rephrase?")
    }

    if (response.text) preambles.push(response.text)
    turns.push({
      role: "assistant",
      text: response.text || undefined,
      toolCalls: response.toolCalls,
      providerParts: response.providerParts,
    })

    for (const call of response.toolCalls) {
      // Destructive tools — and, when the user asked to confirm every change,
      // write tools too — only propose: the call is validated, described from
      // current data, and parked for the user's confirmation. Nothing executes.
      const writeTool = toolRegistry[call.name]
      const confirmable =
        destructiveTools[call.name] ??
        (askFirst && writeTool?.tier === "write" && writeTool.describe
          ? { input: writeTool.input, describe: writeTool.describe }
          : undefined)
      if (confirmable) {
        const parsed = confirmable.input.safeParse(call.args ?? {})
        const described = parsed.success
          ? await confirmable.describe(input.userId, input.missionId, parsed.data)
          : { error: "invalid arguments" }
        if (!parsed.success || "error" in described || proposals.length >= MAX_PROPOSALS_PER_TURN) {
          consecutiveFailures++
          trace.push({ tool: call.name, ok: false })
          const error = !parsed.success
            ? { error: "invalid arguments", issues: parsed.error.issues }
            : "error" in described
              ? described
              : { error: `at most ${MAX_PROPOSALS_PER_TURN} deletions can be proposed at once` }
          turns.push({ role: "tool", name: call.name, callId: call.id, result: error })
          continue
        }
        const action = await proposeAction(input.userId, {
          missionId: input.missionId,
          turnId,
          tool: call.name,
          args: parsed.data,
          summary: described.summary,
        })
        proposals.push(action)
        trace.push({ tool: call.name, ok: true })
        input.onEvent?.({ type: "confirmation", action })
        // The model learns only that confirmation is pending — never the nonce.
        turns.push({
          role: "tool",
          name: call.name,
          callId: call.id,
          result: { status: "awaiting_user_confirmation", summary: described.summary },
        })
        continue
      }

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
        const { result, receipt } = await tool.execute(input.userId, input.missionId, parsed.data, { turnId })
        consecutiveFailures = 0
        trace.push({ tool: call.name, ok: true })
        if (receipt) {
          const entry = { tool: tool.name, text: receipt }
          receipts.push(entry)
          input.onEvent?.({ type: "receipt", receipt: entry })
        }
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

    // A proposal ends the turn with a fixed reply: the model never gets to
    // describe a deletion as done, and the user decides on the card.
    if (proposals.length > 0) {
      const onlyDeletions = proposals.every((p) => p.tool in destructiveTools)
      const what = onlyDeletions ? "deleting anything" : "making changes"
      return finish(
        proposals.length === 1
          ? `I need your confirmation before ${what} — nothing has changed yet. Confirm or cancel below.`
          : `I need your confirmation for these ${proposals.length} ${onlyDeletions ? "deletions" : "changes"} — nothing has changed yet. Confirm or cancel each below.`
      )
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      turns.push({
        role: "user",
        text: "SYSTEM NOTE: several tool calls failed. Stop calling tools and answer the user with what you have, stating plainly what you could not complete.",
      })
      const final = await generate([])
      return finish(final?.text || "I couldn't complete that — something kept failing. Please try again.", steps + 1)
    }
  }

  return finish(
    receipts.length
      ? "I reached my step limit for one turn, but the actions listed above did complete. Ask me to continue."
      : "That took more steps than I'm allowed in one turn. Try breaking the request into smaller pieces."
  )
}
