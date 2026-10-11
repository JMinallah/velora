/**
 * Route × actor tests for the chat and document routes (docs/06-DELIVERY-PLAN.md
 * 2.5-10), against a real MongoDB. The LLM is a scripted provider injected
 * through getLlmProvider(), so no network calls are made.
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import fs from "node:fs"
import path from "node:path"
import type { LlmProvider, ProviderResponse, AgentTurn } from "@/agent/providers/types"

const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null),
}))

let provider: LlmProvider | null = null
vi.mock("@/agent/providers", () => ({ getLlmProvider: () => provider }))

import { POST as createMissionRoute } from "@/app/api/missions/route"
import { POST as chatRoute } from "@/app/api/missions/[id]/chat/route"
import { GET as listMessagesRoute } from "@/app/api/missions/[id]/messages/route"
import { GET as listEventsRoute } from "@/app/api/missions/[id]/events/route"
import { GET as listTasksRoute } from "@/app/api/missions/[id]/tasks/route"
import { GET as listDocumentsRoute, POST as attachDocumentRoute } from "@/app/api/missions/[id]/documents/route"
import { POST as ingestRoute } from "@/app/api/missions/[id]/documents/ingest/route"
import { LOCAL_UPLOAD_DIR } from "@/lib/storage/gcs"
import { closeClient } from "@/adapters/db"

const UPLOAD_USERS = ["user-ingest", "user-ingest-attacker"]

beforeAll(() => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_agentdocs_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  delete process.env.GCS_BUCKET // local, non-public storage
})

afterAll(async () => {
  if (!TEST_URI) return
  for (const user of UPLOAD_USERS) fs.rmSync(path.join(LOCAL_UPLOAD_DIR, user), { recursive: true, force: true })
  const { getDb } = await import("@/adapters/db")
  await (await getDb()).dropDatabase()
  await closeClient()
})

const asUser = (id: string | null) => (currentUserId = id)
const req = (method: string, urlPath: string, body?: unknown) =>
  new NextRequest(`http://localhost${urlPath}`, {
    method,
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })

async function createMissionAs(userId: string): Promise<string> {
  asUser(userId)
  const res = await createMissionRoute(req("POST", "/api/missions", { title: "Move to Seoul" }), ctx({}))
  expect(res.status).toBe(201)
  return (await res.json()).data.id
}

/** Returns its responses in order and records every request it was given. */
function scripted(responses: (ProviderResponse | Error)[]) {
  const seen: AgentTurn[][] = []
  let i = 0
  const p: LlmProvider = {
    async generate(input) {
      seen.push(structuredClone(input.turns))
      const next = responses[Math.min(i++, responses.length - 1)]
      if (next instanceof Error) throw next
      return next
    },
  }
  return { provider: p, seen }
}

const chat = (missionId: string, body: unknown) =>
  chatRoute(req("POST", `/api/missions/${missionId}/chat`, body), ctx({ id: missionId }))

describeDb("chat route", () => {
  it("rejects anonymous (401), foreign missions (404) and bad bodies (400)", async () => {
    const missionId = await createMissionAs("user-chat-owner")
    provider = scripted([{ text: "hi", toolCalls: [] }]).provider

    asUser(null)
    expect((await chat(missionId, { message: "hi" })).status).toBe(401)

    asUser("user-chat-stranger")
    expect((await chat(missionId, { message: "hi" })).status).toBe(404)

    asUser("user-chat-owner")
    expect((await chat(missionId, {})).status).toBe(400)
    expect((await chat(missionId, { message: "x".repeat(4001) })).status).toBe(400)
    expect((await chat(missionId, "{not json")).status).toBe(400)
  })

  it("answers 503 agent_disabled when no model is configured", async () => {
    const missionId = await createMissionAs("user-chat-disabled")
    provider = null
    const res = await chat(missionId, { message: "hello" })
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("agent_disabled")
  })

  it("runs tools, returns receipts, and persists the exchange with provenance", async () => {
    const missionId = await createMissionAs("user-chat-happy")
    const script = scripted([
      { text: "", toolCalls: [{ name: "createTask", args: { label: "Book movers", dueDate: "2026-11-01" }, id: "c1" }] },
      { text: "Added it.", toolCalls: [] },
      { text: "You're welcome.", toolCalls: [] },
    ])
    provider = script.provider

    const res = await chat(missionId, { message: "Please add a task to book movers by Nov 1" })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      reply: "Added it.",
      receipts: [{ tool: "createTask", text: 'Created task "Book movers" — due 2026-11-01' }],
      promptVersion: "coordinator.v1",
    })

    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages.map((m: { type: string; text: string }) => [m.type, m.text])).toEqual([
      ["user", "Please add a task to book movers by Nov 1"],
      ["update", '✓ Created task "Book movers" — due 2026-11-01'],
      ["reasoning", "Added it."],
    ])
    expect(messages[2].promptVersion).toBe("coordinator.v1")

    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(tasks).toEqual([expect.objectContaining({ label: "Book movers", source: "agent", dueDate: "2026-11-01" })])
    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(expect.objectContaining({ type: "task-created", actor: "agent" }))

    // The next turn's history comes from the database, receipts included.
    await chat(missionId, { message: "Thanks!" })
    const history = script.seen[2]
    expect(history[0]).toEqual({ role: "user", text: "Please add a task to book movers by Nov 1" })
    expect(history[1]).toMatchObject({ role: "assistant", text: expect.stringContaining("✓ Created task") })
    expect(history.at(-1)).toEqual({ role: "user", text: "Thanks!" })
  })

  it("maps provider overload to 503 llm_transient and stores nothing", async () => {
    const missionId = await createMissionAs("user-chat-overload")
    provider = scripted([Object.assign(new Error("quota exceeded"), { status: 429 })]).provider

    const res = await chat(missionId, { message: "hello?" })
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("llm_transient")
    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages).toHaveLength(0)
  })
})

describeDb("documents route", () => {
  it("validates input, keeps extraction server-owned, and is scoped per user", async () => {
    const missionId = await createMissionAs("user-docs")
    const attach = (body: unknown) =>
      attachDocumentRoute(req("POST", `/api/missions/${missionId}/documents`, body), ctx({ id: missionId }))

    expect((await attach({})).status).toBe(400)
    expect((await attach({ name: "x", storageUrl: "https://evil.example/passport.pdf" })).status).toBe(400)

    const ok = await attach({ name: "passport.pdf", storageUrl: "local://x.pdf", extractedText: "FAKE: valid forever" })
    expect(ok.status).toBe(201)
    expect((await ok.json()).data).toMatchObject({ name: "passport.pdf", extractedText: "" })

    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(expect.objectContaining({ type: "document-attached", actor: "user" }))

    asUser("user-docs-stranger")
    expect((await attach({ name: "sneaky.pdf" })).status).toBe(404)
    const foreignList = await listDocumentsRoute(req("GET", "/"), ctx({ id: missionId }))
    expect((await foreignList.json()).data).toHaveLength(0)
  })
})

describeDb("document ingest route", () => {
  const upload = (missionId: string, file?: File) => {
    const form = new FormData()
    if (file) form.append("file", file)
    return ingestRoute(
      new NextRequest(`http://localhost/api/missions/${missionId}/documents/ingest`, { method: "POST", body: form }),
      ctx({ id: missionId })
    )
  }

  it("rejects anonymous (401) and foreign missions (404) before storing anything", async () => {
    const missionId = await createMissionAs("user-ingest")
    const file = new File(["hello"], "note.txt", { type: "text/plain" })

    asUser(null)
    expect((await upload(missionId, file)).status).toBe(401)

    asUser("user-ingest-attacker")
    expect((await upload(missionId, file)).status).toBe(404)
    expect(fs.existsSync(path.join(LOCAL_UPLOAD_DIR, "user-ingest-attacker"))).toBe(false)
  })

  it("enforces presence (400), type (415) and size (413)", async () => {
    const missionId = await createMissionAs("user-ingest")
    expect((await upload(missionId)).status).toBe(400)
    expect((await upload(missionId, new File(["PK"], "a.zip", { type: "application/zip" }))).status).toBe(415)
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })
    expect((await upload(missionId, big)).status).toBe(413)
  })

  it("stores under a server-generated key — a traversal filename cannot escape — and audits extraction", async () => {
    const missionId = await createMissionAs("user-ingest")
    // Enough ../ to reach the filesystem root from any checkout location; the
    // old code (filename joined into the path) wrote this file to /tmp.
    const hostile = new File(["Passport expires 2027-01-01"], `${"../".repeat(16)}tmp/velora-pwn.txt`, {
      type: "text/plain",
    })

    const res = await upload(missionId, hostile)
    expect(res.status).toBe(201)
    const doc = (await res.json()).data
    expect(doc.name).toBe("velora-pwn.txt") // display name only
    expect(doc.storageUrl).toMatch(/^local:\/\/user-ingest\/[0-9a-f-]{36}\.txt$/)

    const key = doc.storageUrl.replace("local://", "")
    expect(fs.readFileSync(path.join(LOCAL_UPLOAD_DIR, key), "utf8")).toBe("Passport expires 2027-01-01")
    expect(fs.existsSync("/tmp/velora-pwn.txt")).toBe(false)

    // Extraction runs in the background and is recorded as a system event.
    let events: { type: string; actor: string }[] = []
    for (let i = 0; i < 50 && !events.some((e) => e.type === "document-updated"); i++) {
      await new Promise((r) => setTimeout(r, 100))
      events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    }
    expect(events).toContainEqual(expect.objectContaining({ type: "document-updated", actor: "system" }))
    const docs = (await (await listDocumentsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(docs[0].extractedText).toBe("Passport expires 2027-01-01")
  })
})
