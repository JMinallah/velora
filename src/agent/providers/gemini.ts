import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/generative-ai"
import { env } from "@/lib/env"
import type { AgentTurn, LlmProvider, ProviderResponse, ToolDeclaration } from "./types"

/** Strips JSON-schema keywords Gemini's function-declaration subset rejects. */
function sanitizeSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== "object" || schema === null) return {}
  const drop = new Set(["$schema", "additionalProperties", "$ref", "definitions", "default"])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (drop.has(key)) continue
    if (key === "properties" && typeof value === "object" && value !== null) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, sanitizeSchema(v)])
      )
    } else if (key === "items") {
      out[key] = sanitizeSchema(value)
    } else if (key === "anyOf" && Array.isArray(value)) {
      // Gemini has no anyOf; keep the first non-null branch.
      const first = value.find(
        (v) => typeof v === "object" && v !== null && (v as { type?: string }).type !== "null"
      )
      return sanitizeSchema(first ?? value[0])
    } else {
      out[key] = value
    }
  }
  return out
}

function toContents(turns: AgentTurn[]): Content[] {
  return turns.map((turn): Content => {
    if (turn.role === "user") {
      return { role: "user", parts: [{ text: turn.text }] }
    }
    if (turn.role === "assistant") {
      const parts: Part[] = []
      if (turn.text) parts.push({ text: turn.text })
      for (const call of turn.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: (call.args ?? {}) as object } })
      }
      return { role: "model", parts }
    }
    return {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: turn.name,
            response: { result: turn.result ?? null },
          },
        },
      ],
    }
  })
}

export class GeminiProvider implements LlmProvider {
  async generate(input: {
    system: string
    turns: AgentTurn[]
    tools: ToolDeclaration[]
  }): Promise<ProviderResponse> {
    const apiKey = env().GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")

    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({
      model: env().GEMINI_MODEL,
      systemInstruction: input.system,
      ...(input.tools.length > 0
        ? {
            tools: [
              {
                functionDeclarations: input.tools.map(
                  (t): FunctionDeclaration =>
                    ({
                      name: t.name,
                      description: t.description,
                      parameters: sanitizeSchema(t.parameters),
                    }) as unknown as FunctionDeclaration
                ),
              },
            ],
          }
        : {}),
    })

    const result = await model.generateContent({
      contents: toContents(input.turns),
      generationConfig: { temperature: 0.2 },
    })

    const response = result.response
    const calls = response.functionCalls() ?? []
    let text = ""
    try {
      text = response.text()
    } catch {
      // text() throws when the response is function-calls only
    }

    return {
      text,
      toolCalls: calls.map((c) => ({ name: c.name, args: c.args })),
    }
  }
}

export function isTransientLlmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /503|429|high demand|temporarily|deadline/i.test(message)
}
