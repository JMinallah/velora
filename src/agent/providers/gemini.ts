import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig, type Part } from "@google/genai"
import { env } from "@/lib/env"
import type { AgentTurn, LlmProvider, ProviderResponse, ToolDeclaration } from "./types"

export function geminiClient(): GoogleGenAI {
  const apiKey = env().GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")
  return new GoogleGenAI({ apiKey })
}

/**
 * Model-family generation settings, kept in code (docs/03-AGENT-DESIGN.md §6).
 * Gemini 3+: low thinking keeps tool-selection turns fast enough for the
 * loop's 30 s budget (default thinking measured at ~100 s on the free tier),
 * and temperature stays at the model default — Google's Gemini 3 guidance is
 * that lowering it can cause looping. Older models get only a low temperature.
 */
export function generationSettings(model: string): GenerateContentConfig {
  if (/^gemini-[3-9]/.test(model)) return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  return { temperature: 0.2 }
}

/**
 * Maps provider-agnostic turns to Gemini contents:
 *  - assistant turns replay the model's own parts verbatim when available —
 *    Gemini 3 rejects function-calling history whose thought signatures
 *    were dropped;
 *  - tool results travel as functionResponse parts in a *user* turn, all
 *    results for one model turn grouped together (one response per call).
 */
export function toContents(turns: AgentTurn[]): Content[] {
  const contents: Content[] = []
  for (const turn of turns) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.text }] })
    } else if (turn.role === "assistant") {
      const parts: Part[] = Array.isArray(turn.providerParts)
        ? (turn.providerParts as Part[])
        : [
            ...(turn.text ? [{ text: turn.text }] : []),
            ...(turn.toolCalls ?? []).map((call) => ({
              functionCall: { name: call.name, args: (call.args ?? {}) as Record<string, unknown>, id: call.id },
            })),
          ]
      if (parts.length > 0) contents.push({ role: "model", parts })
    } else {
      const part: Part = {
        functionResponse: { name: turn.name, id: turn.callId, response: { result: turn.result ?? null } },
      }
      const last = contents[contents.length - 1]
      if (last?.role === "user" && last.parts?.every((p) => p.functionResponse)) last.parts.push(part)
      else contents.push({ role: "user", parts: [part] })
    }
  }
  return contents
}

function toFunctionDeclaration(tool: ToolDeclaration) {
  const schema: Record<string, unknown> = { ...tool.parameters }
  delete schema.$schema
  const properties = schema.properties as object | undefined
  const hasParams = Boolean(properties && Object.keys(properties).length > 0)
  return {
    name: tool.name,
    description: tool.description,
    // JSON Schema is accepted as-is; a tool with no parameters omits it.
    ...(hasParams ? { parametersJsonSchema: schema } : {}),
  }
}

export class GeminiProvider implements LlmProvider {
  async generate(input: { system: string; turns: AgentTurn[]; tools: ToolDeclaration[] }): Promise<ProviderResponse> {
    const model = env().GEMINI_MODEL
    const response = await geminiClient().models.generateContent({
      model,
      contents: toContents(input.turns),
      config: {
        systemInstruction: input.system,
        ...generationSettings(model),
        ...(input.tools.length > 0 ? { tools: [{ functionDeclarations: input.tools.map(toFunctionDeclaration) }] } : {}),
      },
    })

    const parts = response.candidates?.[0]?.content?.parts ?? []
    return {
      text: parts
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join(""),
      toolCalls: (response.functionCalls ?? []).map((c) => ({ name: c.name ?? "", args: c.args ?? {}, id: c.id })),
      providerParts: parts,
    }
  }
}

/** Rate limits (429) and server-side failures are worth a retry; bad requests are not. */
export function isTransientLlmError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === "number") return status === 429 || status >= 500
  const message = error instanceof Error ? error.message : String(error)
  return /\b(429|500|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|temporarily|deadline/i.test(message)
}
