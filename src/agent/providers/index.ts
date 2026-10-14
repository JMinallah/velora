import { agentEnabled } from "@/lib/env"
import { markProviderQuotaSpent, reserveModelCall } from "@/domain/llm-budget"
import { countHourly } from "@/domain/ops-metrics"
import { errorFields, log } from "@/lib/log"
import { GeminiProvider, isDailyQuotaError } from "./gemini"
import type { LlmProvider, ProviderResponse } from "./types"

/**
 * The configured model provider, or null when AI is disabled (manual mode).
 * Routes depend on this function, not on a concrete provider, so a second
 * provider (e.g. a Groq fallback) or a scripted test provider plugs in here.
 */
export function getLlmProvider(): LlmProvider | null {
  return agentEnabled() ? withDailyBudget(new GeminiProvider()) : null
}

/**
 * Every model call first reserves a unit of the app's daily budget
 * (NFR-PERF-4); a provider "daily quota spent" error closes the budget for
 * the rest of the day, so later requests fail fast instead of each waiting
 * on the provider.
 */
export function withDailyBudget(provider: LlmProvider): LlmProvider {
  // Each call is also logged (model, latency, tokens, tool calls, outcome —
  // never content; NFR-OBS-1) and counted for the ops page.
  const guard = async <T>(kind: string, call: () => Promise<T>): Promise<T> => {
    await reserveModelCall()
    const startedAt = Date.now()
    try {
      const result = await call()
      const ms = Date.now() - startedAt
      const response = typeof result === "object" && result !== null ? (result as unknown as ProviderResponse) : null
      log.info("model_call", {
        model: provider.model,
        kind,
        ms,
        ok: true,
        ...(response?.usage ?? {}),
        ...(response?.toolCalls ? { toolCalls: response.toolCalls.map((c) => c.name) } : {}),
      })
      countHourly({ llmCalls: 1, llmMsTotal: ms })
      return result
    } catch (error) {
      const ms = Date.now() - startedAt
      log.warn("model_call", { model: provider.model, kind, ms, ok: false, ...errorFields(error) })
      countHourly({ llmCalls: 1, llmFailures: 1, llmMsTotal: ms })
      if (isDailyQuotaError(error)) await markProviderQuotaSpent().catch(() => undefined)
      throw error
    }
  }
  return {
    model: provider.model,
    generate: (input) => guard("generate", () => provider.generate(input)),
    ...(provider.generateStream && { generateStream: (input) => guard("stream", () => provider.generateStream!(input)) }),
    ...(provider.generateStructured && { generateStructured: (input) => guard("structured", () => provider.generateStructured!(input)) }),
  }
}
