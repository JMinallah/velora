/**
 * Observability (delivery plan 7-3, NFR-OBS-1/3, NFR-SEC-5): structured
 * logs with request ids and no content, hourly ops counters, and the
 * admin-only ops page data.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { NextRequest } from "next/server"
import type { LlmProvider } from "@/agent/providers/types"

const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null),
}))

import { errorFields, log, requestIdFor } from "@/lib/log"
import { routeOf, withAuth } from "@/lib/with-auth"
import { withDailyBudget } from "@/agent/providers"
import { GET as opsRoute } from "@/app/api/ops/route"
import { GET as listMissionsRoute } from "@/app/api/missions/route"
import { closeClient, getDb } from "@/adapters/db"
import { COLLECTIONS } from "@/domain/collections"
import { recentHours } from "@/domain/ops-metrics"
import { createMission } from "@/domain/missions"
import { createReminder } from "@/domain/reminders"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_obs_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  process.env.ADMIN_EMAILS = " Ops-Admin@test.dev , someone@else.dev"
  delete process.env.GEMINI_API_KEY
  await getDb()
})

afterAll(async () => {
  if (!TEST_URI) return
  await (await getDb()).dropDatabase()
  await closeClient()
})

afterEach(() => vi.restoreAllMocks())

/** Captures structured log lines written during `fn`. */
async function captureLogs(fn: () => Promise<unknown>) {
  const lines: Record<string, unknown>[] = []
  const grab = (line: unknown) => {
    try {
      lines.push(JSON.parse(String(line)))
    } catch {
      // not a structured line
    }
  }
  vi.spyOn(console, "info").mockImplementation(grab)
  vi.spyOn(console, "warn").mockImplementation(grab)
  vi.spyOn(console, "error").mockImplementation(grab)
  await fn()
  return lines
}

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1`, ...headers } })

/** Counters are written in the background; wait until they show up. */
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await read()
    if (ok(v)) return v
    await new Promise((r) => setTimeout(r, 50))
  }
  return read()
}

describe("structured logs", () => {
  it("are one JSON object per line and never carry content, addresses or secrets", async () => {
    const lines = await captureLogs(async () =>
      log.info("example", {
        count: 2,
        text: "my visa was refused",
        nested: { email: "a@b.c", Authorization: "Bearer x", fine: "ok", items: [{ prompt: "p", n: 1 }] },
      })
    )
    expect(lines).toEqual([
      expect.objectContaining({
        level: "info",
        event: "example",
        count: 2,
        text: "[redacted]",
        nested: { email: "[redacted]", Authorization: "[redacted]", fine: "ok", items: [{ prompt: "[redacted]", n: 1 }] },
      }),
    ])
    expect(JSON.stringify(lines)).not.toMatch(/visa|a@b\.c|Bearer/)
  })

  it("describe errors briefly: kind, bounded message, status — no stack", () => {
    const err = Object.assign(new Error("x".repeat(1000)), { status: 503 })
    const fields = errorFields(err)
    expect(fields).toEqual({ errorName: "Error", errorMessage: "x".repeat(300), errorCode: 503 })
  })

  it("request ids: the caller's or platform's when well-formed, else a new one", () => {
    expect(requestIdFor(req("/", { "x-request-id": "abc12345-req" }))).toBe("abc12345-req")
    expect(requestIdFor(req("/", { "x-vercel-id": "fra1::iad1::abcdefgh-1234" }))).toBe("fra1::iad1::abcdefgh-1234")
    expect(requestIdFor(req("/", { "x-request-id": "bad id with spaces\n" }))).toMatch(/^[0-9a-f-]{36}$/)
    expect(requestIdFor(req("/"))).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("routes are logged with ids collapsed", () => {
    expect(routeOf(req("/api/missions/0f8fad5b-d9cb-469f-a165-70867728950e/tasks/6523f1a2b3c4d5e6f7a8b9c0"))).toBe("/api/missions/:id/tasks/:id")
    expect(routeOf(req("/api/reminders"))).toBe("/api/reminders")
  })
})

describeDb("request logging and counters", () => {
  it("tags each request with an id (response header and every log line) and counts it", async () => {
    currentUserId = "obs-user"
    const before = (await recentHours(1))[0]
    let res: Response | undefined
    const lines = await captureLogs(async () => {
      res = await listMissionsRoute(req("/api/missions", { "x-request-id": "trace-me-123" }), { params: Promise.resolve({}) })
    })
    expect(res!.status).toBe(200)
    expect(res!.headers.get("x-request-id")).toBe("trace-me-123")
    expect(lines).toContainEqual(
      expect.objectContaining({ event: "request", requestId: "trace-me-123", method: "GET", route: "/api/missions", status: 200, ms: expect.any(Number) })
    )
    expect(JSON.stringify(lines)).not.toContain("obs-user@test.dev")
    await eventually(() => recentHours(1), (h) => (h[0].requests ?? 0) > (before.requests ?? 0))
  })

  it("an unhandled error becomes a logged, counted 500 with a generic message", async () => {
    currentUserId = "obs-user"
    const before = (await recentHours(1))[0]
    const boom = withAuth(async () => {
      throw new Error("database exploded with user secret inside")
    })
    let res: Response | undefined
    const lines = await captureLogs(async () => {
      res = await boom(req("/api/boom"), { params: Promise.resolve({}) })
    })
    expect(res!.status).toBe(500)
    expect(await res!.json()).toEqual({ success: false, error: "Internal server error" })
    expect(lines).toContainEqual(expect.objectContaining({ event: "unhandled_route_error", level: "error", route: "/api/boom" }))
    expect(JSON.stringify(lines)).not.toContain("user secret")
    await eventually(() => recentHours(1), (h) => (h[0].serverErrors ?? 0) > (before.serverErrors ?? 0))
  })

  it("model calls are logged with model, latency, tokens and tool names — not the conversation", async () => {
    const fake: LlmProvider = {
      model: "fake-model-1",
      async generate() {
        return { text: "Your visa appointment is on Monday", toolCalls: [{ name: "listTasks", args: {} }], usage: { inputTokens: 812, outputTokens: 40 } }
      },
    }
    const before = (await recentHours(1))[0]
    const lines = await captureLogs(() =>
      withDailyBudget(fake).generate({ system: "secret system prompt", turns: [{ role: "user", text: "when is my visa appointment?" }], tools: [] })
    )
    expect(lines).toContainEqual(
      expect.objectContaining({ event: "model_call", model: "fake-model-1", kind: "generate", ok: true, inputTokens: 812, outputTokens: 40, toolCalls: ["listTasks"], ms: expect.any(Number) })
    )
    expect(JSON.stringify(lines)).not.toMatch(/visa|secret system prompt/)
    await eventually(() => recentHours(1), (h) => (h[0].llmCalls ?? 0) > (before.llmCalls ?? 0))
  })
})

describeDb("ops page data", () => {
  it("is for admins only: everyone else gets 404", async () => {
    currentUserId = "not-an-admin"
    expect((await opsRoute(req("/api/ops"), { params: Promise.resolve({}) })).status).toBe(404)
    currentUserId = null
    expect((await opsRoute(req("/api/ops"), { params: Promise.resolve({}) })).status).toBe(401)
  })

  it("shows the AI budget, 24-hour error rate and reminder dispatch status", async () => {
    // A reminder an hour overdue that no dispatcher has picked up: the scheduler looks stopped.
    const mission = await createMission("obs-owner", { title: "Move" })
    await createReminder("obs-owner", { missionId: mission.id, title: "Late one", dueAt: new Date(Date.now() - 3_600_000).toISOString() })
    await (await getDb()).collection(COLLECTIONS.reminderDispatches).insertOne({ id: "d1", userId: "obs-owner", reminderId: "r", at: new Date().toISOString(), outcome: "sent", channel: "in-app" })

    currentUserId = "ops-admin" // ops-admin@test.dev is listed (case and spaces ignored)
    const res = await opsRoute(req("/api/ops"), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.ai).toMatchObject({ enabled: false, cap: expect.any(Number), exhausted: false })
    expect(data.last24h).toMatchObject({ requests: expect.any(Number), errorRate: expect.any(Number), dispatchOutcomes: { sent: 1 } })
    expect(data.last24h.requests).toBeGreaterThan(0)
    expect(data.last24h.serverErrors).toBeGreaterThan(0) // the 500 above
    expect(data.reminders.late).toBeGreaterThanOrEqual(1)
    expect(data.reminders.byStatus.scheduled).toBeGreaterThanOrEqual(1)
    expect(data.reminders.lastDispatchAt).toEqual(expect.any(String))
    expect(data.hours).toHaveLength(24)
    expect(JSON.stringify(data)).not.toMatch(/obs-owner|Late one/)
  })
})
