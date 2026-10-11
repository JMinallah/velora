import { agentEnabled } from "@/lib/env"
import { GeminiProvider } from "./gemini"
import type { LlmProvider } from "./types"

/**
 * The configured model provider, or null when AI is disabled (manual mode).
 * Routes depend on this function, not on a concrete provider, so a second
 * provider (e.g. a Groq fallback) or a scripted test provider plugs in here.
 */
export function getLlmProvider(): LlmProvider | null {
  return agentEnabled() ? new GeminiProvider() : null
}
