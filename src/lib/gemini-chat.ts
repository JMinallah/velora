export type GeminiChatTurn = {
  sender: string
  text: string
}

export type GeminiChatRequest = {
  message: string
  history?: GeminiChatTurn[]
  context?: string
}

type GeminiChatResponse = {
  response?: string
  error?: string
}

type SendGeminiChatOptions = {
  signal?: AbortSignal
}

export function buildMissionChatContext(input: {
  missionTitle: string
  missionSubtitle?: string
  documents: string[]
}) {
  const contextLines = [
    `Mission: ${input.missionTitle}`,
    input.missionSubtitle ? `Summary: ${input.missionSubtitle}` : null,
    input.documents.length > 0 ? `Attached documents: ${input.documents.join(", ")}` : null,
  ]

  return contextLines.filter(Boolean).join("\n")
}

export async function sendGeminiChat(
  input: GeminiChatRequest,
  options: SendGeminiChatOptions = {}
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  })

  const data = (await response.json().catch(() => ({}))) as GeminiChatResponse

  if (!response.ok) {
    throw new Error(data.error || "Failed to get response from Gemini")
  }

  if (!data.response) {
    throw new Error("Gemini returned an empty response")
  }

  return data.response
}