import { agentEnabled } from "@/lib/env"
import { markProviderQuotaSpent, reserveModelCall } from "@/domain/llm-budget"
import { GeminiProvider, isDailyQuotaError } from "./gemini"
import type { LlmProvider } from "./types"

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
  const guard = async <T>(call: () => Promise<T>): Promise<T> => {
    await reserveModelCall()
    try {
      return await call()
    } catch (error) {
      if (isDailyQuotaError(error)) await markProviderQuotaSpent().catch(() => undefined)
      throw error
    }
  }
  return {
    generate: (input) => guard(() => provider.generate(input)),
    ...(provider.generateStream && { generateStream: (input) => guard(() => provider.generateStream!(input)) }),
    ...(provider.generateStructured && { generateStructured: (input) => guard(() => provider.generateStructured!(input)) }),
  }
}
