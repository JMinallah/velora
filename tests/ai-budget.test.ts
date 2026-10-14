/**
 * The app-wide daily AI budget and the usage meter (delivery plan 7-2,
 * NFR-PERF-4): counting model calls, pausing cleanly at the cap or when the
 * provider says its daily quota is spent, and reporting it honestly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import type { LlmProvider } from "@/agent/providers/types"

const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null),
}))

/** Counts what reaches the model. Routes get it through the real budget wrapper. */
let modelCalls = 0
const fakeModel: LlmProvider = {
  async generate() {
    modelCalls++
    return { text: "Hello!", toolCalls: [] }
  },
}
vi.mock("@/agent/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent/providers")>()
  return { ...actual, getLlmProvider: () => actual.withDailyBudget(fakeModel) }
})

import { withDailyBudget } from "@/agent/providers"
import { isDailyQuotaError } from "@/agent/providers/gemini"
import { GET as statusRoute } from "@/app/api/ai/status/route"
import { POST as chatRoute } from "@/app/api/missions/[id]/chat/route"
import { POST as planRoute } from "@/app/api/plans/route"
import { closeClient, getDb } from "@/adapters/db"
import { createMission } from "@/domain/missions"
import {
  getAiBudget,
  LlmBudgetExhaustedError,
  markProviderQuotaSpent,
  quotaDay,
  quotaResetsAt,
  reserveModelCall,
} from "@/domain/llm-budget"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_budget_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  process.env.GEMINI_API_KEY = "test-key-not-used" // AI "enabled"; the model itself is fake
  process.env.LLM_DAILY_CAP = "5"
  await getDb()
})

afterAll(async () => {
  if (!TEST_URI) return
  await (await getDb()).dropDatabase()
  await closeClient()
})

const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const status = async () => (await (await statusRoute(req("GET", "/api/ai/status"), { params: Promise.resolve({}) })).json()).data

describe("quota day", () => {
  it("follows the provider's reset at midnight Pacific, through daylight saving", () => {
    // 06:00 UTC on the 14th is still the 13th in California (UTC-7 in October).
    expect(quotaDay(new Date("2026-10-14T06:00:00Z"))).toBe("2026-10-13")
    expect(quotaResetsAt(new Date("2026-10-14T06:00:00Z")).toISOString()).toBe("2026-10-14T07:00:00.000Z")
    expect(quotaDay(new Date("2026-10-14T07:00:00Z"))).toBe("2026-10-14")
    // After the clocks change (1 Nov 2026), midnight Pacific is 08:00 UTC.
    expect(quotaResetsAt(new Date("2026-11-05T12:00:00Z")).toISOString()).toBe("2026-11-06T08:00:00.000Z")
  })
})

describeDb("daily budget", () => {
  it("never lets concurrent callers past the cap", async () => {
    const day = new Date("2030-01-01T20:00:00Z")
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveModelCall(day)))
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    expect(rejected).toHaveLength(3)
    expect(rejected.every((r) => r.reason instanceof LlmBudgetExhaustedError)).toBe(true)
    expect(await getAiBudget(day)).toMatchObject({ calls: 5, cap: 5, exhausted: true })
    // The next quota day starts fresh.
    await expect(reserveModelCall(new Date("2030-01-02T20:00:00Z"))).resolves.toBeUndefined()
  })

  it("closes for the day when the provider reports its daily quota spent", async () => {
    const day = new Date("2030-02-01T20:00:00Z")
    await reserveModelCall(day)
    await markProviderQuotaSpent(day)
    await expect(reserveModelCall(day)).rejects.toBeInstanceOf(LlmBudgetExhaustedError)
    expect(await getAiBudget(day)).toMatchObject({ calls: 1, exhausted: true })
  })

  it("its error is reported like the provider's own daily-quota error", () => {
    expect(isDailyQuotaError(new LlmBudgetExhaustedError())).toBe(true)
  })
})

describeDb("AI routes under the budget (today)", () => {
  it("reports AI as available with the user's usage", async () => {
    currentUserId = "budget-user"
    expect(await status()).toEqual({
      available: true,
      reason: null,
      usage: { used: 0, limit: 50, resetsAt: expect.any(String) },
    })
  })

  it("counts every model call; a provider daily-quota error stops further calls", async () => {
    const before = (await getAiBudget()).calls
    let fail = false
    const flaky: LlmProvider = {
      async generate() {
        modelCalls++
        if (fail) throw new Error("429 RESOURCE_EXHAUSTED: GenerateRequestsPerDayPerProjectPerModel-FreeTier")
        return { text: "ok", toolCalls: [] }
      },
    }
    const metered = withDailyBudget(flaky)
    const sent = modelCalls
    await metered.generate({ system: "", turns: [], tools: [] })
    expect((await getAiBudget()).calls).toBe(before + 1)

    fail = true
    await expect(metered.generate({ system: "", turns: [], tools: [] })).rejects.toThrow(/PerDay/)
    // Closed now: the model isn't even asked.
    await expect(metered.generate({ system: "", turns: [], tools: [] })).rejects.toBeInstanceOf(LlmBudgetExhaustedError)
    expect(modelCalls - sent).toBe(2)
  })

  it("then pauses AI honestly: banner status, and routes answer without calling the model", async () => {
    currentUserId = "budget-user"
    const s = await status()
    expect(s).toMatchObject({ available: false, reason: "daily-limit" })
    expect(Date.parse(s.resumesAt)).toBeGreaterThan(Date.now())

    const mission = await createMission("budget-user", { title: "Move" })
    const sent = modelCalls
    const chat = await chatRoute(req("POST", `/api/missions/${mission.id}/chat`, { message: "What's next?" }), {
      params: Promise.resolve({ id: mission.id }),
    })
    expect(chat.status).toBe(503)
    expect(await chat.json()).toMatchObject({ code: "llm_quota", error: expect.stringMatching(/daily limit.*everything else keeps working/) })

    const plan = await planRoute(req("POST", "/api/plans", { goal: "Move to Lisbon" }), { params: Promise.resolve({}) })
    expect(plan.status).toBe(503)
    expect((await plan.json()).code).toBe("llm_quota")
    expect(modelCalls).toBe(sent)

    // Each attempt still counts against the user's own daily share.
    expect((await status()).usage.used).toBe(2)
  })
})
