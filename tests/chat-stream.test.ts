import { describe, it, expect } from "vitest"
import { readChatStream, type ChatStreamEvent } from "@/lib/chat-stream"

/** A body delivered in exactly these byte chunks, like a slow network. */
function bodyFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe("readChatStream", () => {
  it("reassembles events split anywhere, including inside a multi-byte character", async () => {
    const ndjson =
      '{"type":"text","delta":"Hel"}\n{"type":"text","delta":"lo"}\n' +
      '{"type":"receipt","tool":"createTask","text":"✓ Created task"}\n' +
      '{"type":"done","reply":"Hello","receipts":[],"promptVersion":"v1","turnId":"t1"}' // no trailing newline
    const bytes = new TextEncoder().encode(ndjson)
    const tick = ndjson.indexOf("✓")
    const tickByte = new TextEncoder().encode(ndjson.slice(0, tick)).length
    // Cut mid-line, and between the 3 bytes of "✓".
    const cuts = [5, 31, tickByte + 1, tickByte + 2, bytes.length]
    const chunks = cuts.map((end, i) => bytes.slice(i === 0 ? 0 : cuts[i - 1], end))

    const events: ChatStreamEvent[] = []
    await readChatStream(bodyFrom(chunks), (e) => events.push(e))
    expect(events.map((e) => e.type)).toEqual(["text", "text", "receipt", "done"])
    expect(events[2]).toMatchObject({ text: "✓ Created task" })
  })

  it("stops and rethrows when the handler throws (e.g. on an error event)", async () => {
    const body = bodyFrom([new TextEncoder().encode('{"type":"error","code":"llm_quota","error":"limit"}\n{"type":"text","delta":"x"}\n')])
    const seen: string[] = []
    await expect(
      readChatStream(body, (e) => {
        seen.push(e.type)
        if (e.type === "error") throw new Error(e.error)
      })
    ).rejects.toThrow("limit")
    expect(seen).toEqual(["error"])
  })
})
