/**
 * The end-to-end tests' fake Gemini server (e2e/fake-gemini.mjs) must speak
 * the protocol the real SDK expects, or the browser tests would test the
 * fake instead of the app. This drives the app's own provider against it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawn, type ChildProcess } from "node:child_process"

const PORT = 3198
let server: ChildProcess

beforeAll(async () => {
  process.env.MONGODB_URI ??= "mongodb://unused"
  process.env.AUTH_SECRET ??= "x".repeat(32)
  process.env.AUTH_GOOGLE_ID ??= "x"
  process.env.AUTH_GOOGLE_SECRET ??= "x"
  process.env.GEMINI_API_KEY = "fake-key"
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${PORT}`
  server = spawn(process.execPath, ["e2e/fake-gemini.mjs", String(PORT)], { stdio: "ignore" })
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.ok).catch(() => false)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("fake-gemini did not start")
})

afterAll(() => {
  server?.kill()
})

describe("fake Gemini server", () => {
  it("answers the app's provider: tool calls, streamed text, structured JSON", async () => {
    const { GeminiProvider } = await import("@/agent/providers/gemini")
    const provider = new GeminiProvider()

    const first = await provider.generate({
      system: "s",
      turns: [{ role: "user", text: "add a task to book the movers on 2026-12-01" }],
      tools: [],
    })
    expect(first.toolCalls).toEqual([expect.objectContaining({ name: "createTask", args: { label: "Book the movers", dueDate: "2026-12-01" } })])
    expect(first.usage).toEqual({ inputTokens: 100, outputTokens: 20 })

    const deltas: string[] = []
    const streamed = await provider.generateStream!({
      system: "s",
      turns: [{ role: "user", text: "hello" }],
      tools: [],
      onText: (d) => deltas.push(d),
    })
    expect(deltas.length).toBe(2)
    expect(streamed.text).toBe("I can help with that. Tell me what you'd like to change.")

    const extraction = JSON.parse(
      await provider.generateStructured!({
        system: "s",
        prompt: "read it",
        jsonSchema: { type: "object" },
        attachments: [{ mimeType: "application/pdf", data: Buffer.from("%PDF") }],
      })
    )
    expect(extraction).toMatchObject({ documentType: "passport", expiryDate: "2032-03-02" })
  })
})
