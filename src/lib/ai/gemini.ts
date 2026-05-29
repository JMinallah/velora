import { GoogleGenerativeAI } from "@google/generative-ai"

const apiKey = process.env.GEMINI_API_KEY
const defaultModelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash"

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set")
}

const client = new GoogleGenerativeAI(apiKey)

export function getGeminiModel(modelName: string = defaultModelName) {
  return client.getGenerativeModel({ model: modelName })
}

export function isTransientGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("503") || message.includes("high demand") || message.includes("temporarily")
}

export async function generateGeminiText(prompt: string, options?: { modelName?: string }) {
  const model = getGeminiModel(options?.modelName)
  const result = await model.generateContent(prompt)
  return result.response.text()
}