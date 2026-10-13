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
import { GET as listDocumentsRoute } from "@/app/api/missions/[id]/documents/route"
import { POST as startUploadRoute } from "@/app/api/missions/[id]/documents/uploads/route"
import { POST as completeUploadRoute } from "@/app/api/missions/[id]/documents/uploads/[uploadId]/complete/route"
import { DELETE as deleteDocumentRoute } from "@/app/api/missions/[id]/documents/[docId]/route"
import { GET as viewDocumentRoute } from "@/app/api/missions/[id]/documents/[docId]/view/route"
import { POST as extractDocumentRoute } from "@/app/api/missions/[id]/documents/[docId]/extract/route"
import { PATCH as verifyDocumentRoute } from "@/app/api/missions/[id]/documents/[docId]/route"
import { GET as getFileRoute, PUT as putFileRoute } from "@/app/api/files/[token]/route"
import { POST as decideRoute } from "@/app/api/missions/[id]/pending-actions/[actionId]/route"
import { GET as getMissionRoute, PATCH as patchMissionRoute } from "@/app/api/missions/[id]/route"
import { POST as createTaskRoute } from "@/app/api/missions/[id]/tasks/route"
import { PATCH as patchTaskRoute } from "@/app/api/missions/[id]/tasks/[taskId]/route"
import { GET as getUndoRoute, POST as undoRoute } from "@/app/api/missions/[id]/undo/route"
import { POST as createPlanRoute } from "@/app/api/plans/route"
import { GET as getPlanRoute } from "@/app/api/plans/[id]/route"
import { POST as acceptPlanRoute } from "@/app/api/plans/[id]/accept/route"
import { POST as rejectPlanRoute } from "@/app/api/plans/[id]/reject/route"
import { GET as listMissionsRoute } from "@/app/api/missions/route"
import { GET as getReplanRoute } from "@/app/api/missions/[id]/replans/[replanId]/route"
import { POST as acceptReplanRoute } from "@/app/api/missions/[id]/replans/[replanId]/accept/route"
import { POST as rejectReplanRoute } from "@/app/api/missions/[id]/replans/[replanId]/reject/route"
import { createHash } from "node:crypto"
import { LOCAL_UPLOAD_DIR } from "@/adapters/storage/local"
import { signGrant } from "@/adapters/storage/signed"
import { closeClient } from "@/adapters/db"

const UPLOAD_USERS = ["user-docs", "user-docs-stranger", "user-docs-delete"]

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
      replans: [],
      promptVersion: "coordinator.v3",
    })

    const messages = (await (await listMessagesRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(messages.map((m: { type: string; text: string }) => [m.type, m.text])).toEqual([
      ["user", "Please add a task to book movers by Nov 1"],
      ["update", '✓ Created task "Book movers" — due 2026-11-01'],
      ["reasoning", "Added it."],
    ])
    expect(messages[2].promptVersion).toBe("coordinator.v3")

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

describeDb("plan proposals: generate → review → accept or reject (4-3, 4-4)", () => {
  const plan = {
    title: "Move to Seoul",
    summary: "Relocating from Nairobi for a new job",
    targetDate: "2027-03-01",
    phases: [
      {
        name: "Paperwork",
        tasks: [
          { key: "visa-reqs", label: "Check visa requirements on the embassy site" },
          { key: "apply-visa", label: "Apply for work visa", dueDate: "2027-01-10", dependsOn: ["visa-reqs"] },
        ],
      },
      { name: "Logistics", tasks: [{ key: "flights", label: "Book flights", dependsOn: ["apply-visa"] }] },
    ],
  }
  const structured = (answers: (string | Error)[]) => {
    let i = 0
    provider = {
      generate: async () => ({ text: "", toolCalls: [] }),
      generateStructured: async () => {
        const next = answers[Math.min(i++, answers.length - 1)]
        if (next instanceof Error) throw next
        return next
      },
    }
  }
  const draft = async (userId: string) => {
    asUser(userId)
    structured([JSON.stringify(plan)])
    const res = await createPlanRoute(req("POST", "/api/plans", { goal: "Move from Nairobi to Seoul" }), ctx({}))
    expect(res.status).toBe(201)
    return (await res.json()).data as { id: string; status: string; plan: typeof plan }
  }
  const accept = (id: string, body: unknown) => acceptPlanRoute(req("POST", "/", body), ctx({ id }))
  const reject = (id: string) => rejectPlanRoute(req("POST", "/", {}), ctx({ id }))
  const missionsOf = async () => (await (await listMissionsRoute(req("GET", "/"), ctx({}))).json()).data as { id: string }[]

  /** Hash of everything the user owns in the mission collections. */
  const stateHash = async (userId: string) => {
    const { getDb } = await import("@/adapters/db")
    const db = await getDb()
    const parts = await Promise.all(
      ["missions", "tasks", "events"].map((c) => db.collection(c).find({ userId }).sort({ id: 1 }).toArray())
    )
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex")
  }

  it("drafting creates a proposal only — no mission exists until it is accepted", async () => {
    const proposal = await draft("user-plan-draft")
    expect(proposal.status).toBe("proposed")
    expect(await missionsOf()).toHaveLength(0)
    const fetched = await getPlanRoute(req("GET", "/"), ctx({ id: proposal.id }))
    expect((await fetched.json()).data.plan.title).toBe("Move to Seoul")

    asUser("user-plan-stranger")
    expect((await getPlanRoute(req("GET", "/"), ctx({ id: proposal.id }))).status).toBe(404)
    expect((await accept(proposal.id, { plan })).status).toBe(404)
  })

  it("rejecting leaves all mission state byte-identical (exit gate)", async () => {
    const proposal = await draft("user-plan-reject")
    const before = await stateHash("user-plan-reject")
    expect((await (await reject(proposal.id)).json()).data).toEqual({ status: "rejected" })
    expect(await stateHash("user-plan-reject")).toBe(before)
    expect((await reject(proposal.id)).status).toBe(409)
    expect((await accept(proposal.id, { plan })).status).toBe(409)
  })

  it("accepting creates the mission, its tasks with real dependencies, and the acceptance event — once", async () => {
    const proposal = await draft("user-plan-accept")
    // The user edits the plan: renames the visa task.
    const edited = structuredClone(plan)
    edited.phases[0].tasks[1].label = "Apply for E-7 work visa"

    const res = await accept(proposal.id, { plan: edited })
    expect(res.status).toBe(200)
    const { missionId } = (await res.json()).data

    const mission = await (await getMissionRoute(req("GET", "/"), ctx({ id: missionId }))).json()
    expect(mission.data).toMatchObject({ title: "Move to Seoul", overview: plan.summary, targetDate: "2027-03-01", source: "onboarding" })

    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as {
      id: string; label: string; phase: string; source: string; dependsOn: string[]
    }[]
    expect(tasks.map((t) => t.label)).toEqual(["Check visa requirements on the embassy site", "Apply for E-7 work visa", "Book flights"])
    expect(tasks.every((t) => t.source === "agent")).toBe(true)
    expect(tasks[1].dependsOn).toEqual([tasks[0].id]) // plan keys became task ids
    expect(tasks[2]).toMatchObject({ phase: "Logistics", dependsOn: [tasks[1].id] })

    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(
      expect.objectContaining({ type: "mission-accepted", actor: "user", payload: expect.objectContaining({ proposalId: proposal.id, tasks: 3 }) })
    )
    expect((await accept(proposal.id, { plan })).status).toBe(409)
  })

  it("an accept that fails part-way leaves nothing behind (exit gate)", async () => {
    const proposal = await draft("user-plan-atomic")
    const before = await stateHash("user-plan-atomic")
    const { acceptProposal } = await import("@/domain/proposals")
    const { missionPlanSchema } = await import("@/domain/plan")
    await expect(
      acceptProposal("user-plan-atomic", proposal.id, missionPlanSchema.parse(plan), {
        beforeCommit: async () => {
          throw new Error("injected failure after the mission and tasks were written")
        },
      })
    ).rejects.toThrow("injected failure")
    expect(await stateHash("user-plan-atomic")).toBe(before)
    expect((await (await getPlanRoute(req("GET", "/"), ctx({ id: proposal.id }))).json()).data.status).toBe("proposed")
    expect((await accept(proposal.id, { plan })).status).toBe(200) // and it still works afterwards
  })

  it("re-validates the user's edits: loops and past dates are refused", async () => {
    const proposal = await draft("user-plan-validate")
    const looping = structuredClone(plan)
    looping.phases[0].tasks[0].dependsOn = ["flights"] as never
    expect((await accept(proposal.id, { plan: looping })).status).toBe(400)
    const past = structuredClone(plan)
    past.phases[1].tasks[0] = { ...past.phases[1].tasks[0], dueDate: "2020-01-01" } as never
    expect((await accept(proposal.id, { plan: past })).status).toBe(400)
  })

  it("explains when AI is off (503), out of quota (503 llm_quota) or can't produce a valid plan (422)", async () => {
    asUser("user-plan-errors")
    const draftRes = () => createPlanRoute(req("POST", "/api/plans", { goal: "Move" }), ctx({}))
    provider = null
    expect((await (await draftRes()).json()).code).toBe("agent_disabled")
    structured([Object.assign(new Error("quotaId GenerateRequestsPerDayPerProjectPerModel"), { status: 429 })])
    expect((await (await draftRes()).json()).code).toBe("llm_quota")
    structured(['{"title": ""}'])
    const invalid = await draftRes()
    expect(invalid.status).toBe(422)
    expect((await invalid.json()).code).toBe("plan_invalid")
  })
})

describeDb("re-planning: the agent proposes a diff; nothing changes until accepted (4-5, FR-MSN-4)", () => {
  const missionHash = async (userId: string) => {
    const { getDb } = await import("@/adapters/db")
    const db = await getDb()
    const parts = await Promise.all(["missions", "tasks"].map((c) => db.collection(c).find({ userId }).sort({ id: 1 }).toArray()))
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex")
  }
  async function setup(userId: string) {
    const missionId = await createMissionAs(userId)
    const add = async (label: string, extra: Record<string, unknown> = {}) =>
      (await (await createTaskRoute(req("POST", "/", { label, ...extra }), ctx({ id: missionId }))).json()).data.id as string
    const lease = await add("Sign lease", { dueDate: "2027-01-05" })
    const movers = await add("Book movers", { dueDate: "2027-01-10", dependsOn: [lease] })
    const party = await add("Farewell party", { dependsOn: [movers] })
    return { missionId, lease, movers, party }
  }
  const propose = async (missionId: string, diff: Record<string, unknown>) => {
    provider = scripted([
      { text: "", toolCalls: [{ name: "proposeReplan", args: diff }] },
      { text: "I've proposed a re-plan — review it.", toolCalls: [] },
    ]).provider
    const data = (await (await chat(missionId, { message: "my move got pushed back" })).json()).data
    return data.replans as { id: string; summary: string }[]
  }
  const tasksOf = async (missionId: string) =>
    (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data as { id: string; label: string; dueDate: string; dependsOn: string[] }[]

  it("proposing changes nothing; reject leaves the mission byte-identical (exit gate)", async () => {
    const { missionId, movers, party } = await setup("user-replan-reject")
    const before = await missionHash("user-replan-reject")
    const [replan] = await propose(missionId, {
      reason: "Move pushed back a month",
      change: [{ taskId: movers, dueDate: "2027-02-10" }],
      remove: [party],
    })
    expect(replan.summary).toBe("Re-plan: 1 to change, 1 to remove — Move pushed back a month")
    expect(await missionHash("user-replan-reject")).toBe(before)

    const review = (await (await getReplanRoute(req("GET", "/"), ctx({ id: missionId, replanId: replan.id }))).json()).data
    expect(review.before.map((t: { label: string }) => t.label).sort()).toEqual(["Book movers", "Farewell party"])

    const res = await rejectReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))
    expect((await res.json()).data).toEqual({ status: "rejected" })
    expect(await missionHash("user-replan-reject")).toBe(before)
    expect((await acceptReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))).status).toBe(409)
  })

  it("accept applies the whole diff at once: add (with dependencies), change, remove, target date", async () => {
    const { missionId, lease, movers, party } = await setup("user-replan-accept")
    const [replan] = await propose(missionId, {
      reason: "Move pushed back a month",
      targetDate: "2027-03-01",
      add: [{ key: "storage", label: "Book storage unit", dependsOn: [lease] }],
      change: [{ taskId: movers, dueDate: "2027-02-10", priority: "high" }],
      remove: [party],
    })
    const res = await acceptReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))
    expect((await res.json()).data).toEqual({ kind: "accepted", added: 1, changed: 1, removed: 1 })

    const tasks = await tasksOf(missionId)
    expect(tasks.map((t) => t.label)).toEqual(["Sign lease", "Book movers", "Book storage unit"])
    expect(tasks.find((t) => t.id === movers)).toMatchObject({ dueDate: "2027-02-10", priority: "high" })
    expect(tasks.find((t) => t.label === "Book storage unit")).toMatchObject({ dependsOn: [lease], source: "agent" })
    expect(tasks.some((t) => t.id === party)).toBe(false)
    const mission = (await (await getMissionRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(mission.targetDate).toBe("2027-03-01")

    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(expect.objectContaining({ type: "replan-generated", actor: "agent" }))
    expect(events).toContainEqual(
      expect.objectContaining({ type: "replan-accepted", actor: "user", payload: expect.objectContaining({ removed: ["Farewell party"] }) })
    )
  })

  it("refuses to apply over the user's later edits, applying nothing", async () => {
    const { missionId, movers, party } = await setup("user-replan-stale")
    const [replan] = await propose(missionId, { reason: "shift", change: [{ taskId: movers, dueDate: "2027-02-10" }], remove: [party] })
    await patchTaskRoute(req("PATCH", "/", { label: "Book movers (2 trucks)" }), ctx({ id: missionId, taskId: movers }))
    const before = await missionHash("user-replan-stale")

    const res = await acceptReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "stale", error: expect.stringMatching(/has changed since Velora proposed/) })
    expect(await missionHash("user-replan-stale")).toBe(before)
  })

  it("an accept that fails part-way leaves nothing behind (exit gate)", async () => {
    const { missionId, movers, party } = await setup("user-replan-atomic")
    const [replan] = await propose(missionId, { reason: "shift", change: [{ taskId: movers, dueDate: "2027-02-10" }], remove: [party] })
    const before = await missionHash("user-replan-atomic")
    const { acceptReplan } = await import("@/domain/replan")
    await expect(
      acceptReplan("user-replan-atomic", missionId, replan.id, {
        beforeCommit: async () => {
          throw new Error("injected failure")
        },
      })
    ).rejects.toThrow("injected failure")
    expect(await missionHash("user-replan-atomic")).toBe(before)
    expect((await acceptReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))).status).toBe(200)
  })

  it("an invalid diff from the model is fed back, not stored", async () => {
    const { missionId } = await setup("user-replan-invalid")
    const replans = await propose(missionId, { reason: "x", remove: ["no-such-task"] })
    expect(replans).toHaveLength(0)
  })

  it("another user's re-plan is 404", async () => {
    const { missionId, party } = await setup("user-replan-owner")
    const [replan] = await propose(missionId, { reason: "x", remove: [party] })
    asUser("user-replan-stranger")
    expect((await getReplanRoute(req("GET", "/"), ctx({ id: missionId, replanId: replan.id }))).status).toBe(404)
    expect((await acceptReplanRoute(req("POST", "/"), ctx({ id: missionId, replanId: replan.id }))).status).toBe(404)
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
    expect(lines[3]).toMatchObject({ reply: "Added it.", promptVersion: "coordinator.v3", turnId: expect.any(String) })

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

describeDb("documents: signed upload → verify → view → delete (5-1, 5-2)", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") // a PNG header is enough for storage

  const start = (missionId: string, body: unknown) =>
    startUploadRoute(req("POST", `/api/missions/${missionId}/documents/uploads`, body), ctx({ id: missionId }))
  const complete = (missionId: string, uploadId: string) =>
    completeUploadRoute(req("POST", "/"), ctx({ id: missionId, uploadId }))
  const putFile = (url: string, bytes: Buffer, contentType: string) =>
    putFileRoute(new Request(`http://localhost${url}`, { method: "PUT", body: new Uint8Array(bytes), headers: { "content-type": contentType } }), {
      params: Promise.resolve({ token: url.split("/").pop()! }),
    })
  const getFile = (url: string) => getFileRoute(new Request(`http://localhost${url}`), { params: Promise.resolve({ token: url.split("/").pop()! }) })

  async function uploadPng(missionId: string, name = "passport.png") {
    const started = await start(missionId, { name, contentType: "image/png", size: PNG.length })
    expect(started.status).toBe(201)
    const { uploadId, url } = (await started.json()).data
    expect((await putFile(url, PNG, "image/png")).status).toBe(200)
    const done = await complete(missionId, uploadId)
    expect(done.status).toBe(201)
    return (await done.json()).data as { id: string; name: string; storageUrl: string }
  }

  it("refuses foreign missions (404), other types (415) and files over 10 MB (413)", async () => {
    const missionId = await createMissionAs("user-docs")
    expect((await start(missionId, { name: "x.zip", contentType: "application/zip", size: 10 })).status).toBe(415)
    expect((await start(missionId, { name: "big.pdf", contentType: "application/pdf", size: 10 * 1024 * 1024 + 1 })).status).toBe(413)
    expect((await start(missionId, { name: "x" })).status).toBe(400)
    asUser("user-docs-stranger")
    expect((await start(missionId, { name: "a.png", contentType: "image/png", size: 10 })).status).toBe(404)
  })

  it("uploads under a server-chosen key, and serves it only through a short-lived owner link", async () => {
    const missionId = await createMissionAs("user-docs")
    const doc = await uploadPng(missionId, "../../../../etc/passwd.png")
    expect(doc.name).toBe("../../../../etc/passwd.png") // display name only
    expect(doc.storageUrl).toMatch(new RegExp(`^local:user-docs/${missionId}/[0-9a-f-]{36}\\.png$`))
    expect(fs.existsSync(path.join(LOCAL_UPLOAD_DIR, doc.storageUrl.slice("local:".length)))).toBe(true)

    const view = await (await viewDocumentRoute(req("GET", "/"), ctx({ id: missionId, docId: doc.id }))).json()
    expect(Date.parse(view.data.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000) // NFR-SEC-4
    const file = await getFile(view.data.url)
    expect(file.status).toBe(200)
    expect(file.headers.get("content-type")).toBe("image/png")
    expect(file.headers.get("cache-control")).toContain("no-store")
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true)

    asUser("user-docs-stranger")
    expect((await viewDocumentRoute(req("GET", "/"), ctx({ id: missionId, docId: doc.id }))).status).toBe(404)
    expect((await deleteDocumentRoute(req("DELETE", "/"), ctx({ id: missionId, docId: doc.id }))).status).toBe(404)
    expect((await (await listDocumentsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data).toHaveLength(0)
  })

  it("signed file links can't be forged, reused for another operation, or used after expiry", async () => {
    const missionId = await createMissionAs("user-docs")
    const doc = await uploadPng(missionId)
    const key = doc.storageUrl.slice("local:".length)
    const viewUrl = (await (await viewDocumentRoute(req("GET", "/"), ctx({ id: missionId, docId: doc.id }))).json()).data.url as string

    const [payload, sig] = viewUrl.split("/").pop()!.split(".")
    expect((await getFile(`/api/files/${payload}.${sig.slice(0, -2)}AA`)).status).toBe(403) // tampered signature
    expect((await putFile(viewUrl, PNG, "image/png")).status).toBe(403) // a view link can't upload
    const expired = signGrant({ op: "get", key, contentType: "image/png", filename: "x.png", exp: Math.floor(Date.now() / 1000) - 1 })
    expect((await getFile(`/api/files/${expired}`)).status).toBe(410)
  })

  it("verifies the stored object before creating a document", async () => {
    const missionId = await createMissionAs("user-docs")
    // Completing before uploading
    const early = (await (await start(missionId, { name: "a.png", contentType: "image/png", size: PNG.length })).json()).data
    expect((await complete(missionId, early.uploadId)).status).toBe(409)
    // Wrong content type at upload time
    expect((await putFile(early.url, PNG, "application/pdf")).status).toBe(400)
    // Uploaded bytes differ from the declared size: discarded
    const lying = (await (await start(missionId, { name: "b.png", contentType: "image/png", size: 999 })).json()).data
    await putFile(lying.url, PNG, "image/png")
    expect((await complete(missionId, lying.uploadId)).status).toBe(422)
    // Completed once only
    await putFile(early.url, PNG, "image/png")
    expect((await complete(missionId, early.uploadId)).status).toBe(201)
    expect((await complete(missionId, early.uploadId)).status).toBe(409)
    expect((await (await listDocumentsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data).toHaveLength(1)
  })

  it("deleting a document — or its mission — removes the stored file", async () => {
    const missionId = await createMissionAs("user-docs-delete")
    const doc = await uploadPng(missionId)
    const file = path.join(LOCAL_UPLOAD_DIR, doc.storageUrl.slice("local:".length))
    expect((await deleteDocumentRoute(req("DELETE", "/"), ctx({ id: missionId, docId: doc.id }))).status).toBe(200)
    expect(fs.existsSync(file)).toBe(false)
    const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(events).toContainEqual(expect.objectContaining({ type: "document-deleted", actor: "user" }))

    const second = await uploadPng(missionId)
    const secondFile = path.join(LOCAL_UPLOAD_DIR, second.storageUrl.slice("local:".length))
    const { deleteMission } = await import("@/domain/missions")
    await deleteMission("user-docs-delete", missionId)
    expect(fs.existsSync(secondFile)).toBe(false)
  })

  describe("reading documents (5-3): quarantined, unverified until confirmed", () => {
    const extraction = (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({
        documentType: "lease",
        title: "Tenancy Agreement",
        summary: "A tenancy agreement for a flat in Seoul.",
        fields: [{ label: "Monthly rent", value: "900,000 KRW" }],
        expiryDate: "2027-08-31",
        containsInstructions: false,
        ...overrides,
      })
    const readWith = (answers: (string | Error)[]) => {
      let i = 0
      const generate = vi.fn()
      provider = {
        generate,
        generateStructured: async () => {
          const next = answers[Math.min(i++, answers.length - 1)]
          if (next instanceof Error) throw next
          return next
        },
      }
      return generate
    }
    const extract = (missionId: string, docId: string) =>
      extractDocumentRoute(req("POST", "/"), ctx({ id: missionId, docId }))
    const verify = (missionId: string, docId: string, body: unknown) =>
      verifyDocumentRoute(req("PATCH", "/", body), ctx({ id: missionId, docId }))

    it("stores the details as AI-extracted and unverified, audited as system", async () => {
      const missionId = await createMissionAs("user-docs")
      const doc = await uploadPng(missionId)
      readWith([extraction()])
      const res = await extract(missionId, doc.id)
      expect(res.status).toBe(200)
      const data = (await res.json()).data
      expect(data.summary).toBe("A tenancy agreement for a flat in Seoul.")
      expect(data.extraction).toMatchObject({ status: "done", documentType: "lease", expiryDate: "2027-08-31", verified: false })
      const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
      expect(events).toContainEqual(expect.objectContaining({ type: "document-updated", actor: "system" }))
    })

    it("an adversarial document is flagged, and can change nothing (FR-DOC-3)", async () => {
      const missionId = await createMissionAs("user-docs")
      const task = await createTaskRoute(req("POST", "/", { label: "Book flights" }), ctx({ id: missionId }))
      expect(task.status).toBe(201)
      const doc = await uploadPng(missionId)
      const generate = readWith([extraction({ containsInstructions: true })])

      const data = (await (await extract(missionId, doc.id)).json()).data
      expect(data.extraction.containsInstructions).toBe(true)
      expect(generate).not.toHaveBeenCalled() // the tool-calling path was never touched
      const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
      expect(tasks).toEqual([expect.objectContaining({ label: "Book flights", completed: false })])
      const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
      expect(events.map((e: { type: string }) => e.type).sort()).toEqual(
        ["document-attached", "document-updated", "mission-created", "task-created"].sort()
      )
    })

    it("confirming — or correcting — makes the details the user's own", async () => {
      const missionId = await createMissionAs("user-docs")
      const doc = await uploadPng(missionId)
      expect((await verify(missionId, doc.id, {})).status).toBe(409) // nothing extracted yet
      readWith([extraction()])
      await extract(missionId, doc.id)

      const res = await verify(missionId, doc.id, {
        fields: [{ label: "Monthly rent", value: "950,000 KRW" }],
        expiryDate: "2027-09-30",
      })
      expect((await res.json()).data.extraction).toMatchObject({
        verified: true,
        fields: [{ label: "Monthly rent", value: "950,000 KRW" }],
        expiryDate: "2027-09-30",
      })
      const events = (await (await listEventsRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
      expect(events.filter((e: { type: string; actor: string }) => e.type === "document-updated").map((e: { actor: string }) => e.actor)).toEqual([
        "system",
        "user",
      ])
    })

    it("explains AI off (503), unreadable documents (422, recorded as failed), and hides others' documents (404)", async () => {
      const missionId = await createMissionAs("user-docs")
      const doc = await uploadPng(missionId)
      provider = null
      expect((await (await extract(missionId, doc.id)).json()).code).toBe("agent_disabled")
      readWith(['{"documentType":"spaceship"}'])
      const failed = await extract(missionId, doc.id)
      expect(failed.status).toBe(422)
      expect((await failed.json()).data.extraction.status).toBe("failed")

      asUser("user-docs-stranger")
      readWith([extraction()])
      expect((await extract(missionId, doc.id)).status).toBe(404)
      expect((await verify(missionId, doc.id, {})).status).toBe(404)
    })
  })
})
