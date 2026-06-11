export type GeminiChatTurn = {
  sender: string
  text: string
}

export type GeminiChatRequest = {
  message: string
  history?: GeminiChatTurn[]
  context?: string
  sessionId?: string
}

type SendGeminiChatOptions = {
  signal?: AbortSignal
  onChunk: (chunk: string) => void
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

const sessionMap = new Map<string, string>();
const USER_ID = "velora-user-" + Math.random().toString(36).substring(7);

export async function sendGeminiChat(
  input: GeminiChatRequest,
  options: SendGeminiChatOptions
): Promise<void> {
  const localSessionKey = input.sessionId || 'default';
  let agentSessionId = sessionMap.get(localSessionKey);

  if (!agentSessionId) {
    const sessionRes = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    });
    const sessionData = await sessionRes.json();
    agentSessionId = sessionData.sessionId;
    if (agentSessionId) {
      sessionMap.set(localSessionKey, agentSessionId);
    }
  }

  const fullMessage = input.context 
    ? `${input.context}\n\n${input.message}` 
    : input.message;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: fullMessage,
      sessionId: agentSessionId,
      userId: USER_ID
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to get response from Agent")
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is empty");
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    options.onChunk(chunk);
  }
}