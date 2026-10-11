/** Events the chat route streams as NDJSON (one JSON object per line). */
export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "receipt"; tool: string; text: string }
  | {
      type: "done"
      reply: string
      receipts: { tool: string; text: string }[]
      promptVersion: string
      turnId: string
    }
  | { type: "error"; code: string; error: string }

/**
 * Reads an NDJSON chat stream, calling `onEvent` for each complete line in
 * order. Network chunks can split a line anywhere, so input is buffered
 * until a newline arrives. An exception thrown by `onEvent` stops reading
 * and propagates to the caller.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const flushLines = () => {
    let newline: number
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) onEvent(JSON.parse(line) as ChatStreamEvent)
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      flushLines()
    }
    buffer += decoder.decode()
    buffer += "\n"
    flushLines()
  } finally {
    reader.releaseLock()
  }
}
