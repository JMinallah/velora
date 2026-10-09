/**
 * Agent loop bounds and self-correction (docs/03-AGENT-DESIGN.md §1.2, §3).
 * Uses a scripted fake provider — no LLM, no network. DB-backed tool
 * execution is covered by tests/routes.test.ts and the eval suite.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { LlmProvider, ProviderResponse } from "@/agent/providers/types"

// The loop imports domain modules; stub them so no DB is needed.
vi.mock("@/domain/missions", () => ({
  getMission: vi.fn().mockResolvedValue({
    id: "m1",
    title: "Move to Seoul",
    status: "On track",
    overview: "Relocation",
  }),
}))
vi.mock("@/domain/tasks", () => ({
  listTasks: vi.fn().mockResolvedValue([
    { id: "t1", label: "Book flights", completed: false, dueDate: "2026-09-01", priority: "high", category: "Travel" },
  ]),
  createTask: vi.fn().mockImplementation(async (_u: string, _m: string, input: { label: string }) => ({
    id: "t-new",
    label: input.label,
    dueDate: null,
    completed: false,
  })),
  updateTask: vi.fn(),
}))
vi.mock("@/domain/reminders", () => ({ createReminder: vi.fn() }))

import { runAgentTurn } from "@/agent/loop"

function scriptedProvider(responses: ProviderResponse[]): LlmProvider & { calls: number } {
  const provider = {
    calls: 0,
    async generate() {
      const response = responses[Math.min(provider.calls, responses.length - 1)]
      provider.calls++
      return response
    },
  }
  return provider
}

const base = { userId: "u1", missionId: "m1", userMessage: "hello" }

describe("runAgentTurn", () => {
  it("returns plain text when the model calls no tools", async () => {
    const provider = scriptedProvider([{ text: "Hi there!", toolCalls: [] }])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.reply).toBe("Hi there!")
    expect(run.receipts).toHaveLength(0)
    expect(provider.calls).toBe(1)
  })

  it("executes a valid write tool and returns its receipt", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "createTask", args: { label: "Get visa photos" } }] },
      { text: "Done — added the task.", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.reply).toBe("Done — added the task.")
    expect(run.receipts).toEqual([
      { tool: "createTask", text: 'Created task "Get visa photos"' },
    ])
  })

  it("feeds invalid arguments back to the model for self-correction", async () => {
    const provider = scriptedProvider([
      // label is required — this call is invalid
      { text: "", toolCalls: [{ name: "createTask", args: { wrong: true } }] },
      { text: "", toolCalls: [{ name: "createTask", args: { label: "Fixed label" } }] },
      { text: "Created it.", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.reply).toBe("Created it.")
    expect(run.receipts.map((r) => r.text)).toEqual(['Created task "Fixed label"'])
  })

  it("rejects unknown tools without crashing", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "deleteEverything", args: {} }] },
      { text: "That tool doesn't exist.", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.reply).toBe("That tool doesn't exist.")
    expect(run.receipts).toHaveLength(0)
  })

  it("forces a final answer after repeated failures instead of looping", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "nope1", args: {} }, { name: "nope2", args: {} }, { name: "nope3", args: {} }] },
      { text: "I couldn't complete that.", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.reply).toBe("I couldn't complete that.")
    // one tool-calling step + one forced-answer call
    expect(provider.calls).toBe(2)
  })

  it("stops at the hard step limit even if the model keeps calling tools", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "listTasks", args: {} }] }, // repeats forever
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(provider.calls).toBeLessThanOrEqual(8)
    expect(run.reply).toMatch(/step/i)
  })

  it("feeds back an updateTask call that changes nothing instead of issuing a receipt", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "updateTask", args: { taskId: "t1" } }] },
      { text: "What should I change?", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.trace).toEqual([{ tool: "updateTask", ok: false }])
    expect(run.receipts).toHaveLength(0)
  })

  it("rejects non-ISO dates from the model", async () => {
    const provider = scriptedProvider([
      { text: "", toolCalls: [{ name: "createTask", args: { label: "Visa", dueDate: "next Friday" } }] },
      { text: "Which date exactly?", toolCalls: [] },
    ])
    const run = await runAgentTurn({ provider, ...base })
    expect(run.trace).toEqual([{ tool: "createTask", ok: false }])
    expect(run.receipts).toHaveLength(0)
  })

  describe("wall-clock budget", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("abandons a model call that hangs past the turn budget", async () => {
      vi.useFakeTimers()
      const provider: LlmProvider = { generate: () => new Promise(() => {}) } // never resolves
      const pending = runAgentTurn({ provider, ...base })
      await vi.advanceTimersByTimeAsync(30_001)
      const run = await pending
      expect(run.reply).toMatch(/ran out of time/i)
    })

    it("keeps receipts from steps that finished before the budget ran out", async () => {
      vi.useFakeTimers()
      let calls = 0
      const provider: LlmProvider = {
        generate: async () => {
          calls++
          if (calls === 1) return { text: "", toolCalls: [{ name: "createTask", args: { label: "Book movers" } }] }
          return new Promise(() => {})
        },
      }
      const pending = runAgentTurn({ provider, ...base })
      await vi.advanceTimersByTimeAsync(30_001)
      const run = await pending
      expect(run.receipts.map((r) => r.text)).toEqual(['Created task "Book movers"'])
      expect(run.reply).toMatch(/actions listed above did complete/i)
    })
  })
})
