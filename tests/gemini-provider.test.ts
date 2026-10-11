/**
 * Gemini request mapping (src/agent/providers/gemini.ts). These shapes were
 * rejected by the live API before the move to @google/genai — the old SDK
 * sent tool results with role "function" and dropped Gemini 3 thought
 * signatures — so they are pinned here without network access.
 */
import { describe, it, expect } from "vitest"
import { toContents, generationSettings, isTransientLlmError } from "@/agent/providers/gemini"

describe("toContents", () => {
  it("returns tool results in one user turn, echoing call ids", () => {
    const contents = toContents([
      { role: "user", text: "What's open?" },
      {
        role: "assistant",
        toolCalls: [
          { name: "listTasks", args: {}, id: "c1" },
          { name: "getMissionOverview", args: {}, id: "c2" },
        ],
      },
      { role: "tool", name: "listTasks", callId: "c1", result: [] },
      { role: "tool", name: "getMissionOverview", callId: "c2", result: { title: "Move" } },
    ])

    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"])
    expect(contents[2].parts).toEqual([
      { functionResponse: { name: "listTasks", id: "c1", response: { result: [] } } },
      { functionResponse: { name: "getMissionOverview", id: "c2", response: { result: { title: "Move" } } } },
    ])
    expect(contents.some((c) => c.role === "function")).toBe(false)
  })

  it("replays the model's own parts verbatim, keeping thought signatures", () => {
    const providerParts = [{ functionCall: { name: "listTasks", args: {}, id: "c1" }, thoughtSignature: "sig-abc" }]
    const contents = toContents([
      { role: "user", text: "hi" },
      { role: "assistant", toolCalls: [{ name: "listTasks", args: {} }], providerParts },
    ])
    expect(contents[1]).toEqual({ role: "model", parts: providerParts })
  })

  it("builds parts from text for history loaded from storage (no provider parts)", () => {
    const contents = toContents([
      { role: "user", text: "hi" },
      { role: "assistant", text: "Hello!" },
    ])
    expect(contents[1]).toEqual({ role: "model", parts: [{ text: "Hello!" }] })
  })
})

describe("generationSettings", () => {
  it("uses low thinking and the default temperature on Gemini 3+", () => {
    expect(generationSettings("gemini-3.5-flash")).toEqual({ thinkingConfig: { thinkingLevel: "LOW" } })
  })
  it("keeps a low temperature and no thinking level on older models", () => {
    expect(generationSettings("gemini-2.5-flash")).toEqual({ temperature: 0.2 })
  })
})

describe("isTransientLlmError", () => {
  it("retries rate limits and server errors, not bad requests", () => {
    expect(isTransientLlmError(Object.assign(new Error("quota"), { status: 429 }))).toBe(true)
    expect(isTransientLlmError(Object.assign(new Error("down"), { status: 503 }))).toBe(true)
    expect(isTransientLlmError(Object.assign(new Error("bad"), { status: 400 }))).toBe(false)
    expect(isTransientLlmError(new Error("RESOURCE_EXHAUSTED"))).toBe(true)
  })
})
