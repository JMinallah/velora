import { env } from "@/lib/env"
import { geminiClient, generationSettings, isTransientLlmError } from "@/agent/providers/gemini"

// Legacy single-shot generation for /api/plan; replaced by structured
// planning in Phase 4 (docs/06-DELIVERY-PLAN.md 4-3, 4-7).

export const isTransientGeminiError = isTransientLlmError

export async function generateGeminiText(prompt: string): Promise<string> {
  const model = env().GEMINI_MODEL
  const response = await geminiClient().models.generateContent({
    model,
    contents: prompt,
    config: generationSettings(model),
  })
  return response.text ?? ""
}
