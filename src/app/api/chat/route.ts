import { getGeminiModel, isTransientGeminiError } from "@/lib/ai/gemini"

type ChatHistoryTurn = {
  sender?: string
  text: string
}

function toModelHistory(history: ChatHistoryTurn[]) {
  const firstUserIndex = history.findIndex((turn) => turn.sender === "user")

  return history
    .slice(firstUserIndex >= 0 ? firstUserIndex : history.length)
    .filter((turn) => typeof turn.text === "string" && turn.text.trim().length > 0)
    .map((turn) => ({
      role: turn.sender === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    }))
}

async function generateWithRetry(prompt: string, history: ChatHistoryTurn[]) {
  let lastError: unknown
  const modelHistory = toModelHistory(history)
  const model = getGeminiModel()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const chat = model.startChat({ history: modelHistory })
      const result = await chat.sendMessage(prompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      lastError = error

      if (attempt === 0 && isTransientGeminiError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 700))
        continue
      }

      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to get response from Gemini")
}

export async function POST(request: Request) {
  try {
    const { message, history = [], context = "" } = await request.json()

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Invalid message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const conversationHistory = Array.isArray(history) ? history : []
    const prompt = [context.trim(), message.trim()].filter(Boolean).join("\n\n") || message
    const responseText = await generateWithRetry(prompt, conversationHistory)

    return new Response(
      JSON.stringify({
        success: true,
        response: responseText,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Gemini API Error:", message)
    return new Response(
      JSON.stringify({
        error: message || "Failed to get response from Gemini",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
