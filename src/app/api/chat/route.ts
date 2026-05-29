import { GoogleGenerativeAI } from "@google/generative-ai"

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

if (!apiKey) {
  throw new Error("NEXT_PUBLIC_GEMINI_API_KEY is not set")
}

const genAI = new GoogleGenerativeAI(apiKey)

export async function POST(request: Request) {
  try {
    const { message, history } = await request.json()

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Invalid message" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" })

    // Build conversation history for context
    const conversationHistory = history.map((msg: any) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }))

    // Add the new message
    conversationHistory.push({
      role: "user",
      parts: [{ text: message }],
    })

    // Start a chat session with history
    const chat = model.startChat({
      history: conversationHistory.slice(0, -1), // Exclude the current message from history
    })

    // Send the message and get response
    const result = await chat.sendMessage(message)
    const response = await result.response
    const responseText = response.text()

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
  } catch (error: any) {
    console.error("Gemini API Error:", error)
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to get response from Gemini",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
