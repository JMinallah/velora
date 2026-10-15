import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig, type Part } from "@google/genai"
import { env } from "@/lib/env"
import type { AgentTurn, GenerateInput, LlmProvider, ProviderResponse, ToolDeclaration } from "./types"

export function geminiClient(): GoogleGenAI {
  const apiKey = env().GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")
  const baseUrl = env().GEMINI_BASE_URL
  return new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) })
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

/**
 * Streamed responses arrive as many small parts. Adjacent plain-text parts are
 * joined back into one (keeping any thought signature — Gemini 3 may attach
 * it to the last, sometimes empty, chunk), so the assistant turn replays as
 * the model produced it. Function-call parts are kept as they are.
 */
export function mergeStreamParts(parts: Part[]): Part[] {
  const merged: Part[] = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    const isText = typeof part.text === "string" && !part.functionCall
    const lastIsText = last && typeof last.text === "string" && !last.functionCall
    if (isText && lastIsText && Boolean(last.thought) === Boolean(part.thought)) {
      merged[merged.length - 1] = {
        ...last,
        text: (last.text ?? "") + (part.text ?? ""),
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
      }
    } else {
      merged.push({ ...part })
    }
  }
  return merged
}

type UsageMetadata = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }

function toUsage(meta: UsageMetadata | undefined): ProviderResponse["usage"] {
  if (!meta) return undefined
  return { inputTokens: meta.promptTokenCount, outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) }
}

function toProviderResponse(parts: Part[], usage?: ProviderResponse["usage"]): ProviderResponse {
  return {
    ...(usage ? { usage } : {}),
    text: parts
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join(""),
    toolCalls: parts
      .filter((p) => p.functionCall)
      .map((p) => ({ name: p.functionCall?.name ?? "", args: p.functionCall?.args ?? {}, id: p.functionCall?.id })),
    providerParts: parts,
  }
}

export class GeminiProvider implements LlmProvider {
  get model() {
    return env().GEMINI_MODEL
  }

  private request(input: GenerateInput) {
    const model = env().GEMINI_MODEL
    return {
      model,
      contents: toContents(input.turns),
      config: {
        systemInstruction: input.system,
        ...generationSettings(model),
        ...(input.tools.length > 0 ? { tools: [{ functionDeclarations: input.tools.map(toFunctionDeclaration) }] } : {}),
        ...(input.signal ? { abortSignal: input.signal } : {}),
      },
    }
  }

  async generate(input: GenerateInput): Promise<ProviderResponse> {
    const response = await geminiClient().models.generateContent(this.request(input))
    return toProviderResponse(response.candidates?.[0]?.content?.parts ?? [], toUsage(response.usageMetadata))
  }

  async generateStructured(input: {
    system: string
    prompt: string
    jsonSchema: Record<string, unknown>
    attachments?: { mimeType: string; data: Buffer }[]
    signal?: AbortSignal
  }): Promise<string> {
    const model = env().GEMINI_MODEL
    const files = (input.attachments ?? []).map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data.toString("base64") } }))
    const response = await geminiClient().models.generateContent({
      model,
      contents: files.length ? [{ role: "user", parts: [...files, { text: input.prompt }] }] : input.prompt,
      config: {
        systemInstruction: input.system,
        ...generationSettings(model),
        responseMimeType: "application/json",
        responseJsonSchema: input.jsonSchema,
        ...(input.signal ? { abortSignal: input.signal } : {}),
      },
    })
    return response.text ?? ""
  }

  async generateStream(input: GenerateInput & { onText: (delta: string) => void }): Promise<ProviderResponse> {
    const stream = await geminiClient().models.generateContentStream(this.request(input))
    const parts: Part[] = []
    let usage: UsageMetadata | undefined
    for await (const chunk of stream) {
      usage = chunk.usageMetadata ?? usage
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part)
        if (typeof part.text === "string" && part.text && !part.thought) input.onText(part.text)
      }
    }
    return toProviderResponse(mergeStreamParts(parts), toUsage(usage))
  }
}

/**
 * The project's per-model *daily* request quota is spent (free tier: e.g. 500/day
 * for Flash-Lite). Unlike a per-minute limit, retrying won't help until it
 * resets at midnight Pacific.
 */
export function isDailyQuotaError(error: unknown): boolean {
  // The app's own budget (src/domain/llm-budget.ts) marks its error the same way.
  if ((error as { dailyQuota?: unknown } | null)?.dailyQuota === true) return true
  const message = error instanceof Error ? error.message : String(error)
  return /PerDay/i.test(message)
}

/** Rate limits (429) and server-side failures are worth a retry; bad requests and spent daily quotas are not. */
export function isTransientLlmError(error: unknown): boolean {
  if (isDailyQuotaError(error)) return false
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status === "number") return status === 429 || status >= 500
  const message = error instanceof Error ? error.message : String(error)
  return /\b(429|500|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|temporarily|deadline/i.test(message)
}
