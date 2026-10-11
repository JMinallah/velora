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
import { POST as decideRoute } from "@/app/api/missions/[id]/pending-actions/[actionId]/route"
import { GET as getMissionRoute, PATCH as patchMissionRoute } from "@/app/api/missions/[id]/route"
import { POST as createTaskRoute } from "@/app/api/missions/[id]/tasks/route"
import { PATCH as patchTaskRoute } from "@/app/api/missions/[id]/tasks/[taskId]/route"
import { GET as getUndoRoute, POST as undoRoute } from "@/app/api/missions/[id]/undo/route"
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
// Each test user gets their own client address, as real users would; otherwise
// every request shares one per-IP rate-limit bucket ("unknown").
const clientHeaders = () => ({ "x-forwarded-for": `test-ip-${currentUserId ?? "anonymous"}` })
const req = (method: string, urlPath: string, body?: unknown) =>
  new NextRequest(`http://localhost${urlPath}`, {
    method,
    headers: {
      ...clientHeaders(),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
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
      proposals: [],
      promptVersion: "coordinator.v2",
    })

    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages.map((m: { type: string; text: string }) => [m.type, m.text])).toEqual([
      ["user", "Please add a task to book movers by Nov 1"],
      ["update", '✓ Created task "Book movers" — due 2026-11-01'],
      ["reasoning", "Added it."],
    ])
    expect(messages[2].promptVersion).toBe("coordinator.v2")

    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(tasks).toEqual([expect.objectContaining({ label: "Book movers", source: "agent", dueDate: "2026-11-01" })])
    // Every message of the turn and the event it caused share one turn id,
    // and the event records the validated tool call (FR-TRS-2).
    const turnIds = new Set(messages.map((m: { turnId?: string }) => m.turnId))
    expect(turnIds.size).toBe(1)
    const [turnId] = turnIds
    expect(turnId).toEqual(expect.any(String))
    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "task-created",
        actor: "agent",
        turnId,
        cause: { tool: "createTask", args: { label: "Book movers", dueDate: "2026-11-01" } },
      })
    )
    // Changes made by hand carry no agent provenance.
    expect(events.find((e: { type: string }) => e.type === "mission-created")).not.toHaveProperty("turnId")

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

describeDb("destructive actions need the user's confirmation (03-AGENT-DESIGN §5)", () => {
  async function missionWithTask(userId: string, label = "Book flights") {
    const missionId = await createMissionAs(userId)
    const res = await createTaskRoute(req("POST", `/api/missions/${missionId}/tasks`, { label }), ctx({ id: missionId }))
    return { missionId, taskId: (await res.json()).data.id as string }
  }

  /** The agent proposes via the real chat route (scripted model). */
  async function propose(missionId: string, call: { name: string; args: Record<string, unknown> }) {
    provider = scripted([{ text: "", toolCalls: [call] }]).provider
    const res = await chat(missionId, { message: "please delete it" })
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.proposals).toHaveLength(1)
    return data.proposals[0] as { id: string; nonce: string; summary: string; status: string }
  }

  const decide = (missionId: string, actionId: string, body: unknown) =>
    decideRoute(req("POST", `/api/missions/${missionId}/pending-actions/${actionId}`, body), ctx({ id: missionId, actionId }))

  const taskIds = async (missionId: string) =>
    ((await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as { id: string }[]).map((t) => t.id)
  const events = async (missionId: string) =>
    (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as Record<string, unknown>[]
  const messages = async (missionId: string) =>
    (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as Record<string, unknown>[]

  it("a proposal deletes nothing, is audited, and is stored as a pending card", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-propose")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })

    expect(action).toMatchObject({ status: "pending", summary: 'Delete task "Book flights"' })
    expect(await taskIds(missionId)).toContain(taskId)
    expect(await events(missionId)).toContainEqual(expect.objectContaining({ type: "action-proposed", actor: "agent" }))
    const card = (await messages(missionId)).find((m) => m.type === "confirmation")
    expect(card).toMatchObject({ action: { id: action.id, status: "pending" } })
  })

  it("rejects a missing/invalid body (400), anonymous (401), a foreign user (404) and a wrong nonce (403)", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-guard")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })

    expect((await decide(missionId, action.id, { decision: "confirm" })).status).toBe(400)
    asUser(null)
    expect((await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })).status).toBe(401)
    asUser("user-del-stranger")
    expect((await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })).status).toBe(404)
    asUser("user-del-guard")
    expect((await decide(missionId, action.id, { nonce: "guessed", decision: "confirm" })).status).toBe(403)

    expect(await taskIds(missionId)).toContain(taskId) // still nothing deleted
  })

  it("confirm executes exactly once with the stored args, audited as confirmed by the user; replay is 409", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-confirm")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })

    const res = await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      status: "executed",
      receipt: 'Deleted task "Book flights"',
      effect: { kind: "task-deleted", taskId },
    })
    expect(await taskIds(missionId)).not.toContain(taskId)

    const deleted = (await events(missionId)).find((e) => e.type === "task-deleted")
    expect(deleted).toMatchObject({ actor: "agent", confirmedBy: "user", cause: { tool: "deleteTask", args: { taskId } } })
    expect((await messages(missionId)).find((m) => m.type === "confirmation")).toMatchObject({ action: { status: "executed" } })

    const replay = await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })
    expect(replay.status).toBe(409)
  })

  it("concurrent confirms execute once", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-race")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })
    const statuses = (
      await Promise.all(Array.from({ length: 5 }, () => decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })))
    ).map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(4)
    expect((await events(missionId)).filter((e) => e.type === "task-deleted")).toHaveLength(1)
  })

  it("reject leaves everything in place and is audited", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-reject")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })

    const res = await decide(missionId, action.id, { nonce: action.nonce, decision: "reject" })
    expect((await res.json()).data).toEqual({ status: "rejected" })
    expect(await taskIds(missionId)).toContain(taskId)
    expect(await events(missionId)).toContainEqual(expect.objectContaining({ type: "action-rejected", actor: "user" }))
    expect((await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })).status).toBe(409)
  })

  it("an expired confirmation is refused (410) and nothing is deleted", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-expired")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })
    const { getDb } = await import("@/adapters/db")
    await (await getDb())
      .collection("pending_actions")
      .updateOne({ id: action.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    expect((await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })).status).toBe(410)
    expect(await taskIds(missionId)).toContain(taskId)
    expect((await messages(missionId)).find((m) => m.type === "confirmation")).toMatchObject({ action: { status: "expired" } })
  })

  it("deleteMission removes the mission only after confirmation", async () => {
    const { missionId } = await missionWithTask("user-del-mission")
    const action = await propose(missionId, { name: "deleteMission", args: {} })
    expect(action.summary).toBe('Delete the whole mission "Move to Seoul" and its 1 task')
    expect((await getMissionRoute(req("GET", "/"), ctx({ id: missionId }))).status).toBe(200)

    const res = await decide(missionId, action.id, { nonce: action.nonce, decision: "confirm" })
    expect((await res.json()).data.effect).toEqual({ kind: "mission-deleted" })
    expect((await getMissionRoute(req("GET", "/"), ctx({ id: missionId }))).status).toBe(404)
  })

  it("the next turn's history tells the model the outcome — never the nonce", async () => {
    const { missionId, taskId } = await missionWithTask("user-del-history")
    const action = await propose(missionId, { name: "deleteTask", args: { taskId } })
    await decide(missionId, action.id, { nonce: action.nonce, decision: "reject" })

    const script = scripted([{ text: "Okay, kept it.", toolCalls: [] }])
    provider = script.provider
    await chat(missionId, { message: "fine, keep it" })
    const history = JSON.stringify(script.seen[0])
    expect(history).toContain("status: rejected")
    expect(history).not.toContain(action.nonce)
  })
})

describeDb("undo for the agent's changes (FR-AGT-6)", () => {
  const rawTask = async (taskId: string) => {
    const { getDb } = await import("@/adapters/db")
    return (await getDb()).collection("tasks").findOne({ id: taskId })
  }
  const agentDoes = async (missionId: string, calls: { name: string; args: Record<string, unknown> }[]) => {
    provider = scripted([{ text: "", toolCalls: calls }, { text: "Done.", toolCalls: [] }]).provider
    expect((await chat(missionId, { message: "please do it" })).status).toBe(200)
  }
  const latest = async (missionId: string) =>
    (await (await getUndoRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as { eventId: string; description: string } | null
  const undo = (missionId: string, eventId: string) =>
    undoRoute(req("POST", `/api/missions/${missionId}/undo`, { eventId }), ctx({ id: missionId }))
  const userTask = async (missionId: string, label: string) =>
    (await (await createTaskRoute(req("POST", "/", { label }), ctx({ id: missionId }))).json()).data.id as string

  it("restores an agent update byte-identically (exit gate) and records the undo", async () => {
    const missionId = await createMissionAs("user-undo-update")
    const taskId = await userTask(missionId, "Book flights")
    const before = await rawTask(taskId)
    expect(await latest(missionId)).toBeNull() // the user's own changes are not the agent's to undo

    await agentDoes(missionId, [{ name: "updateTask", args: { taskId, label: "Book cheaper flights", priority: "high" } }])
    expect((await rawTask(taskId))?.label).toBe("Book cheaper flights")
    const change = await latest(missionId)
    expect(change?.description).toBe('Updated task "Book flights"')

    const res = await undo(missionId, change!.eventId)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ undid: 'Updated task "Book flights"', next: null })
    expect(await rawTask(taskId)).toEqual(before) // identical, including _id and updatedAt

    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(
      expect.objectContaining({ type: "change-undone", actor: "user", payload: expect.objectContaining({ eventId: change!.eventId }) })
    )
  })

  it("undoes an agent-created task by removing it, and a completion by reopening", async () => {
    const missionId = await createMissionAs("user-undo-create")
    const mine = await userTask(missionId, "Find apartment")
    await agentDoes(missionId, [{ name: "completeTask", args: { taskId: mine, completed: true } }])
    const completion = await latest(missionId)
    expect(completion?.description).toBe('Completed task "Find apartment"')
    expect((await undo(missionId, completion!.eventId)).status).toBe(200)
    expect((await rawTask(mine))?.completed).toBe(false)

    await agentDoes(missionId, [{ name: "createTask", args: { label: "Buy adapter plugs" } }])
    const created = await latest(missionId)
    expect(created?.description).toBe('Created task "Buy adapter plugs"')
    expect((await undo(missionId, created!.eventId)).status).toBe(200)
    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(tasks.map((t: { label: string }) => t.label)).toEqual(["Find apartment"])
  })

  it("refuses to overwrite the user's edits made after the agent's change (exit gate)", async () => {
    const missionId = await createMissionAs("user-undo-conflict")
    await agentDoes(missionId, [{ name: "createTask", args: { label: "Get visa photos" } }])
    const change = await latest(missionId)
    const taskId = ((await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data[0] as { id: string }).id
    await patchTaskRoute(req("PATCH", "/", { label: "Get visa photos (2 copies)" }), ctx({ id: missionId, taskId }))

    const res = await undo(missionId, change!.eventId)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "edited_since", error: expect.stringMatching(/overwrite your edits/) })
    expect((await rawTask(taskId))?.label).toBe("Get visa photos (2 copies)")
  })

  it("only the most recent change can be undone; then the one before it", async () => {
    const missionId = await createMissionAs("user-undo-stack")
    await agentDoes(missionId, [
      { name: "createTask", args: { label: "First" } },
      { name: "createTask", args: { label: "Second" } },
    ])
    const newest = await latest(missionId)
    expect(newest?.description).toBe('Created task "Second"')
    const { getDb } = await import("@/adapters/db")
    const older = await (await getDb())
      .collection("events")
      .findOne({ missionId, type: "task-created", "payload.label": "First" })

    expect((await (await undo(missionId, older!.id)).json()).code).toBe("not_latest")
    expect((await undo(missionId, newest!.eventId)).status).toBe(200)
    expect((await latest(missionId))?.eventId).toBe(older!.id)
    expect((await undo(missionId, older!.id)).status).toBe(200)
    expect(await latest(missionId)).toBeNull()
  })

  it("concurrent undos of the same change succeed once", async () => {
    const missionId = await createMissionAs("user-undo-race")
    const taskId = await userTask(missionId, "Ship boxes")
    await agentDoes(missionId, [{ name: "updateTask", args: { taskId, label: "Ship 12 boxes" } }])
    const change = await latest(missionId)
    const statuses = (await Promise.all(Array.from({ length: 4 }, () => undo(missionId, change!.eventId)))).map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(3)
  })

  it("another user's mission is 404", async () => {
    const missionId = await createMissionAs("user-undo-owner")
    asUser("user-undo-stranger")
    expect((await getUndoRoute(req("GET", "/"), ctx({ id: missionId }))).status).toBe(404)
    expect((await undo(missionId, "anything")).status).toBe(404)
  })
})

describeDb('autonomy "confirm-writes": every agent change waits for the user (FR-TRS-4)', () => {
  const patchMission = (missionId: string, body: unknown) =>
    patchMissionRoute(req("PATCH", `/api/missions/${missionId}`, body), ctx({ id: missionId }))

  it("validates the setting", async () => {
    const missionId = await createMissionAs("user-auto-validate")
    expect((await patchMission(missionId, { settings: { autonomy: "yolo" } })).status).toBe(400)
    const ok = await patchMission(missionId, { settings: { autonomy: "confirm-writes" } })
    expect((await ok.json()).data.settings).toEqual({ autonomy: "confirm-writes" })
  })

  it("parks writes; confirming applies them as the agent, confirmed by the user, and undoably", async () => {
    const missionId = await createMissionAs("user-auto-flow")
    await patchMission(missionId, { settings: { autonomy: "confirm-writes" } })

    provider = scripted([
      {
        text: "",
        toolCalls: [
          { name: "createTask", args: { label: "Book movers" } },
          { name: "createReminder", args: { title: "Call movers", dueAt: "2026-11-01T09:00:00Z" } },
        ],
      },
    ]).provider
    const res = await chat(missionId, { message: "add a movers task and remind me" })
    const { proposals, reply } = (await res.json()).data
    expect(reply).toMatch(/before making changes|these 2 changes/)
    expect(proposals.map((p: { summary: string }) => p.summary)).toEqual([
      'Create task "Book movers"',
      'Schedule reminder "Call movers" for 2026-11-01 09:00',
    ])
    expect((await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data).toHaveLength(0)

    const confirm = (p: { id: string; nonce: string }) =>
      decideRoute(req("POST", "/", { nonce: p.nonce, decision: "confirm" }), ctx({ id: missionId, actionId: p.id }))
    const first = await confirm(proposals[0])
    expect((await first.json()).data).toEqual({ status: "executed", receipt: 'Created task "Book movers"', effect: { kind: "data-changed" } })

    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(tasks).toEqual([expect.objectContaining({ label: "Book movers", source: "agent" })])
    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(expect.objectContaining({ type: "task-created", actor: "agent", confirmedBy: "user" }))

    // A confirmed change is still Velora's change, so it can be undone.
    const undoable = (await (await getUndoRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(undoable.description).toBe('Created task "Book movers"')
  })
})

describeDb("agent tool setTaskDependency (4-2)", () => {
  it("sets dependencies with a receipt, and a loop is refused without changing anything", async () => {
    const missionId = await createMissionAs("user-agent-deps")
    const add = async (label: string) =>
      (await (await createTaskRoute(req("POST", "/", { label }), ctx({ id: missionId }))).json()).data.id as string
    const lease = await add("Sign lease")
    const movers = await add("Book movers")

    provider = scripted([
      { text: "", toolCalls: [{ name: "setTaskDependency", args: { taskId: movers, dependsOn: [lease] } }] },
      { text: "", toolCalls: [{ name: "setTaskDependency", args: { taskId: lease, dependsOn: [movers] } }] },
      { text: "Done.", toolCalls: [] },
    ]).provider
    const res = await chat(missionId, { message: "movers after lease, and lease after movers" })
    const data = (await res.json()).data
    expect(data.receipts).toEqual([{ tool: "setTaskDependency", text: '"Book movers" now waits for 1 task' }])

    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    const byId = Object.fromEntries(tasks.map((t: { id: string; dependsOn: string[] }) => [t.id, t.dependsOn]))
    expect(byId[movers]).toEqual([lease])
    expect(byId[lease]).toEqual([]) // the looping request was refused
  })
})

describeDb("chat route — streaming (NDJSON)", () => {
  const streamChat = async (missionId: string, message: string) => {
    const res = await chatRoute(
      new NextRequest(`http://localhost/api/missions/${missionId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
        headers: { ...clientHeaders(), "content-type": "application/json", accept: "application/x-ndjson" },
      }),
      ctx({ id: missionId })
    )
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l))
    return { res, lines }
  }

  it("streams text deltas and receipts, ends with the stored reply, and persists the turn", async () => {
    const missionId = await createMissionAs("user-stream")
    let call = 0
    provider = {
      generate: async () => ({ text: "", toolCalls: [] }),
      async generateStream({ onText }) {
        if (++call === 1) return { text: "", toolCalls: [{ name: "createTask", args: { label: "Pack books" } }] }
        onText("Added ")
        onText("it.")
        return { text: "Added it.", toolCalls: [] }
      },
    }

    const { res, lines } = await streamChat(missionId, "Add a task to pack books")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/x-ndjson")
    expect(lines.map((l) => l.type)).toEqual(["receipt", "text", "text", "done"])
    expect(lines[0]).toMatchObject({ tool: "createTask", text: 'Created task "Pack books"' })
    expect(lines[3]).toMatchObject({ reply: "Added it.", promptVersion: "coordinator.v2", turnId: expect.any(String) })

    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages.map((m: { type: string }) => m.type)).toEqual(["user", "update", "reasoning"])
    expect(messages[2].text).toBe("Added it.")
  })

  it("reports a mid-stream failure as an error event and stores nothing", async () => {
    const missionId = await createMissionAs("user-stream-quota")
    provider = {
      generate: async () => ({ text: "", toolCalls: [] }),
      generateStream: async () => {
        throw Object.assign(new Error("quotaId GenerateRequestsPerDayPerProjectPerModel"), { status: 429 })
      },
    }
    const { lines } = await streamChat(missionId, "hello?")
    expect(lines).toEqual([{ type: "error", code: "llm_quota", error: expect.stringMatching(/daily limit/) }])
    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages).toHaveLength(0)
  })
})

describeDb("chat route — daily quota", () => {
  it("says the daily AI limit is reached (503 llm_quota), not 'briefly overloaded', and stores nothing", async () => {
    const missionId = await createMissionAs("user-chat-quota")
    provider = scripted([
      Object.assign(new Error("quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier"), { status: 429 }),
    ]).provider

    const res = await chat(missionId, { message: "hello?" })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: "llm_quota", error: expect.stringMatching(/daily limit/) })
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
