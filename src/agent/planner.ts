import { structuredOutputSchema } from "./json-schema"
import type { LlmProvider } from "./providers/types"
import { plannerPrompt, plannerSystemPrompt, PLANNER_PROMPT_VERSION } from "./prompts/planner.v2"
import { missionPlanSchema, planDateIssues, type MissionPlan } from "@/domain/plan"

/**
 * Plan generation (FR-MSN-1, delivery plan 4-3): structured output validated
 * against missionPlanSchema, with up to two repair rounds that feed the exact
 * problems back to the model. An invalid plan is never returned.
 */
const MAX_ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 45_000

export class PlanGenerationError extends Error {
  constructor(readonly issues: string[]) {
    super(`The plan could not be generated in a valid form: ${issues.slice(0, 5).join("; ")}`)
  }
}

let cachedSchema: Record<string, unknown> | null = null
/** JSON Schema for structured output; cross-field rules (unique keys, no loops) are checked after parsing. */
export function planJsonSchema(): Record<string, unknown> {
  cachedSchema ??= structuredOutputSchema(missionPlanSchema)
  return cachedSchema
}

/** Every reason a candidate answer is not an acceptable plan; empty when it is. */
export function planIssues(raw: string, today: string): { plan: MissionPlan | null; issues: string[] } {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { plan: null, issues: ["the answer was not valid JSON"] }
  }
  const parsed = missionPlanSchema.safeParse(json)
  if (!parsed.success) {
    return {
      plan: null,
      issues: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
    }
  }
  const dateIssues = planDateIssues(parsed.data, today)
  return dateIssues.length ? { plan: null, issues: dateIssues } : { plan: parsed.data, issues: [] }
}

export async function generatePlan(input: {
  provider: LlmProvider
  goal: string
  deadline?: string
  concerns?: string
  today: string
}): Promise<{ plan: MissionPlan; attempts: number; promptVersion: string }> {
  const { provider } = input
  if (!provider.generateStructured) throw new Error("This model provider cannot produce structured plans")

  const basePrompt = plannerPrompt(input)
  let prompt = basePrompt
  let issues: string[] = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await provider.generateStructured({
      system: plannerSystemPrompt,
      prompt,
      jsonSchema: planJsonSchema(),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
    const result = planIssues(raw, input.today)
    if (result.plan) return { plan: result.plan, attempts: attempt, promptVersion: PLANNER_PROMPT_VERSION }

    issues = result.issues
    prompt = [
      basePrompt,
      "",
      "Your previous answer was not a valid plan. Problems:",
      ...issues.slice(0, 20).map((i) => `- ${i}`),
      "",
      "Previous answer:",
      raw.slice(0, 12_000),
      "",
      "Return a corrected plan that fixes every problem.",
    ].join("\n")
  }
  throw new PlanGenerationError(issues)
}
