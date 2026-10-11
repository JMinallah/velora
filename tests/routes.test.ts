/**
 * Route × actor authorization matrix (docs/04-SECURITY.md §2.2):
 * every route is exercised as {anonymous, wrong user, owner} against a real
 * (in-memory) MongoDB, and foreign resources must render as 404, never 403.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Requires a running MongoDB, provided via TEST_MONGODB_URI:
 *   local: podman run -d --name velora-test-mongo -p 27017:27017 mongo:4.4
 *          TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
 *          (127.0.0.1, not localhost: localhost may resolve to IPv6 ::1,
 *          which rootless podman port forwarding resets)
 *   CI:    provided by the mongo service container in ci.yml.
 * Skipped (visibly) when TEST_MONGODB_URI is not set.
 */
const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () =>
    currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null,
}))

import { GET as listMissionsRoute, POST as createMissionRoute } from "@/app/api/missions/route"
import {
  GET as getMissionRoute,
  PATCH as patchMissionRoute,
  DELETE as deleteMissionRoute,
} from "@/app/api/missions/[id]/route"
import { GET as listTasksRoute, POST as createTaskRoute } from "@/app/api/missions/[id]/tasks/route"
import {
  PATCH as patchTaskRoute,
  DELETE as deleteTaskRoute,
} from "@/app/api/missions/[id]/tasks/[taskId]/route"
import { GET as listEventsRoute } from "@/app/api/missions/[id]/events/route"
import { GET as cronRemindersRoute } from "@/app/api/cron/reminders/route"
import { GET as listRemindersRoute, POST as createReminderRoute } from "@/app/api/reminders/route"
import { POST as planRoute } from "@/app/api/plans/route"
import { POST as createMessageRoute, GET as listMessagesRoute } from "@/app/api/missions/[id]/messages/route"
import { closeClient } from "@/adapters/db"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  process.env.CRON_SECRET = "test-cron-secret"
  // These tests exercise manual mode; a key in the developer's shell must not leak in.
  delete process.env.GEMINI_API_KEY
})

afterAll(async () => {
  if (!TEST_URI) return
  const { getDb } = await import("@/adapters/db")
  await (await getDb()).dropDatabase()
  await closeClient()
})

const asUser = (id: string | null) => (currentUserId = id)
const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  })
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })

async function createMissionAs(userId: string): Promise<string> {
  asUser(userId)
  const res = await createMissionRoute(
    req("POST", "/api/missions", { title: "Move to Seoul", overview: "Relocation" }),
    ctx({})
  )
  expect(res.status).toBe(201)
  const json = await res.json()
  return json.data.id as string
}

describeDb("missions routes", () => {
  it("rejects anonymous requests with 401", async () => {
    asUser(null)
    const res = await listMissionsRoute(req("GET", "/api/missions"), ctx({}))
    expect(res.status).toBe(401)
  })

  it("scopes mission lists per user", async () => {
    const idA = await createMissionAs("user-a")

    asUser("user-b")
    const res = await listMissionsRoute(req("GET", "/api/missions"), ctx({}))
    const json = await res.json()
    expect(json.data.map((m: { id: string }) => m.id)).not.toContain(idA)
  })

  it("returns 404 (not 403) for another user's mission", async () => {
    const idA = await createMissionAs("user-a")

    asUser("user-b")
    for (const [handler, method] of [
      [getMissionRoute, "GET"],
      [patchMissionRoute, "PATCH"],
      [deleteMissionRoute, "DELETE"],
    ] as const) {
      const res = await handler(
        req(method, `/api/missions/${idA}`, method === "PATCH" ? { title: "hijack" } : undefined),
        ctx({ id: idA })
      )
      expect(res.status).toBe(404)
    }

    asUser("user-a")
    const mine = await getMissionRoute(req("GET", `/api/missions/${idA}`), ctx({ id: idA }))
    expect(mine.status).toBe(200)
  })

  it("emits audit events for create/update/delete", async () => {
    const id = await createMissionAs("user-events")
    const patched = await patchMissionRoute(req("PATCH", `/api/missions/${id}`, { title: "Renamed" }), ctx({ id }))
    expect(patched.status).toBe(200)
    const deleted = await deleteMissionRoute(req("DELETE", `/api/missions/${id}`), ctx({ id }))
    expect(deleted.status).toBe(200)

    const res = await listEventsRoute(req("GET", `/api/missions/${id}/events`), ctx({ id }))
    const json = await res.json()
    const types = json.data.map((e: { type: string }) => e.type)
    expect(types).toEqual(
      expect.arrayContaining(["mission-created", "mission-updated", "mission-deleted"])
    )
  })
})

describeDb("zero-AI mission creation", () => {
  it("creates a mission from just a title, with no AI involved", async () => {
    asUser("user-manual")
    const res = await createMissionRoute(req("POST", "/api/missions", { title: "Start university in Lyon" }), ctx({}))
    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({
      title: "Start university in Lyon",
      overview: "",
      targetDate: null,
      source: "manual",
    })
  })

  it("stores a valid target date and rejects an invalid one", async () => {
    asUser("user-manual")
    const ok = await createMissionRoute(
      req("POST", "/api/missions", { title: "Move", targetDate: "2026-12-01" }),
      ctx({})
    )
    expect(ok.status).toBe(201)
    expect((await ok.json()).data.targetDate).toBe("2026-12-01")

    const bad = await createMissionRoute(
      req("POST", "/api/missions", { title: "Move", targetDate: "end of year" }),
      ctx({})
    )
    expect(bad.status).toBe(400)
  })

  it("plan route reports AI as disabled (503 agent_disabled) so the client can offer manual planning", async () => {
    asUser("user-manual")
    const res = await planRoute(req("POST", "/api/plans", { goal: "Move to Seoul" }), ctx({}))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("agent_disabled")

    asUser(null)
    const anon = await planRoute(req("POST", "/api/plans", { goal: "Move to Seoul" }), ctx({}))
    expect(anon.status).toBe(401)
  })
})

describeDb("mission input validation", () => {
  it("PATCH cannot reassign ownership or identity fields", async () => {
    const id = await createMissionAs("user-owner")
    const res = await patchMissionRoute(
      req("PATCH", `/api/missions/${id}`, { userId: "user-victim", id: "hijacked", createdAt: "1999-01-01", title: "Renamed" }),
      ctx({ id })
    )
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data).toMatchObject({ id, userId: "user-owner", title: "Renamed" })
    expect(data.createdAt).not.toBe("1999-01-01")

    asUser("user-victim")
    const victimList = await (await listMissionsRoute(req("GET", "/api/missions"), ctx({}))).json()
    expect(victimList.data).toHaveLength(0)
  })

  it("rejects an invalid status and malformed JSON with 400", async () => {
    const id = await createMissionAs("user-validate")
    const badStatus = await patchMissionRoute(req("PATCH", `/api/missions/${id}`, { status: "Done!!" }), ctx({ id }))
    expect(badStatus.status).toBe(400)

    const malformed = await createMissionRoute(
      new NextRequest("http://localhost/api/missions", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      }),
      ctx({})
    )
    expect(malformed.status).toBe(400)
  })
})

describeDb("tasks routes", () => {
  it("cannot create a task in another user's mission (404)", async () => {
    const idA = await createMissionAs("user-a")

    asUser("user-b")
    const res = await createTaskRoute(
      req("POST", `/api/missions/${idA}/tasks`, { label: "sneaky task" }),
      ctx({ id: idA })
    )
    expect(res.status).toBe(404)
  })

  it("owner can create, update, and delete a task, with events emitted", async () => {
    const missionId = await createMissionAs("user-c")

    const createRes = await createTaskRoute(
      req("POST", `/api/missions/${missionId}/tasks`, { label: "Book flights", priority: "high" }),
      ctx({ id: missionId })
    )
    expect(createRes.status).toBe(201)
    const taskId = (await createRes.json()).data.id as string

    const patchRes = await patchTaskRoute(
      req("PATCH", `/api/missions/${missionId}/tasks/${taskId}`, { completed: true }),
      ctx({ id: missionId, taskId })
    )
    expect(patchRes.status).toBe(200)
    expect((await patchRes.json()).data.completed).toBe(true)

    // wrong user cannot touch the task
    asUser("user-d")
    const foreignPatch = await patchTaskRoute(
      req("PATCH", `/api/missions/${missionId}/tasks/${taskId}`, { completed: false }),
      ctx({ id: missionId, taskId })
    )
    expect(foreignPatch.status).toBe(404)

    asUser("user-c")
    const deleteRes = await deleteTaskRoute(
      req("DELETE", `/api/missions/${missionId}/tasks/${taskId}`),
      ctx({ id: missionId, taskId })
    )
    expect(deleteRes.status).toBe(200)

    const events = await (
      await listEventsRoute(req("GET", `/api/missions/${missionId}/events`), ctx({ id: missionId }))
    ).json()
    const types = events.data.map((e: { type: string }) => e.type)
    expect(types).toEqual(
      expect.arrayContaining(["task-created", "task-updated", "task-deleted"])
    )
  })

  it("rejects non-ISO due dates and ignores a client-claimed agent origin", async () => {
    const missionId = await createMissionAs("user-dates")
    const freeText = await createTaskRoute(
      req("POST", `/api/missions/${missionId}/tasks`, { label: "Visa", dueDate: "next Friday" }),
      ctx({ id: missionId })
    )
    expect(freeText.status).toBe(400)
    const impossible = await createTaskRoute(
      req("POST", `/api/missions/${missionId}/tasks`, { label: "Visa", dueDate: "2026-02-30" }),
      ctx({ id: missionId })
    )
    expect(impossible.status).toBe(400)

    const ok = await createTaskRoute(
      req("POST", `/api/missions/${missionId}/tasks`, { label: "Visa", dueDate: "2026-09-01", source: "agent" }),
      ctx({ id: missionId })
    )
    expect(ok.status).toBe(201)
    expect((await ok.json()).data).toMatchObject({ dueDate: "2026-09-01", source: "user" })
  })

  it("task list is scoped: wrong user sees empty, not the owner's tasks", async () => {
    const missionId = await createMissionAs("user-e")
    await createTaskRoute(
      req("POST", `/api/missions/${missionId}/tasks`, { label: "Visa appointment" }),
      ctx({ id: missionId })
    )

    asUser("user-f")
    const res = await listTasksRoute(req("GET", `/api/missions/${missionId}/tasks`), ctx({ id: missionId }))
    expect((await res.json()).data).toHaveLength(0)
  })
})

describeDb("task dependencies (4-2)", () => {
  const post = (missionId: string, body: Record<string, unknown>) =>
    createTaskRoute(req("POST", `/api/missions/${missionId}/tasks`, body), ctx({ id: missionId }))
  const patch = (missionId: string, taskId: string, body: Record<string, unknown>) =>
    patchTaskRoute(req("PATCH", `/api/missions/${missionId}/tasks/${taskId}`, body), ctx({ id: missionId, taskId }))

  it("accepts valid dependencies and rejects self, foreign, unknown and looping ones", async () => {
    const missionId = await createMissionAs("user-deps")
    const lease = (await (await post(missionId, { label: "Sign lease" })).json()).data.id
    const movers = await post(missionId, { label: "Book movers", dependsOn: [lease] })
    expect(movers.status).toBe(201)
    const moversId = (await movers.json()).data.id

    const loop = await patch(missionId, lease, { dependsOn: [moversId] })
    expect(loop.status).toBe(400)
    expect((await loop.json()).error).toBe("That would create a loop: Sign lease → Book movers → Sign lease.")
    expect((await patch(missionId, lease, { dependsOn: [lease] })).status).toBe(400)
    expect((await post(missionId, { label: "x", dependsOn: ["no-such-task"] })).status).toBe(400)

    const otherMission = await createMissionAs("user-deps")
    const foreign = (await (await post(otherMission, { label: "elsewhere" })).json()).data.id
    expect((await patch(missionId, lease, { dependsOn: [foreign] })).status).toBe(400)

    const dedup = await patch(missionId, moversId, { dependsOn: [lease, lease] })
    expect((await dedup.json()).data.dependsOn).toEqual([lease])
  })

  it("deleting a task removes it from other tasks' dependencies", async () => {
    const missionId = await createMissionAs("user-deps-delete")
    const lease = (await (await post(missionId, { label: "Sign lease" })).json()).data.id
    const movers = (await (await post(missionId, { label: "Book movers", dependsOn: [lease] })).json()).data.id
    await deleteTaskRoute(req("DELETE", `/api/missions/${missionId}/tasks/${lease}`), ctx({ id: missionId, taskId: lease }))
    const tasks = (await (await listTasksRoute(req("GET", "/"), ctx({ id: missionId }))).json()).data
    expect(tasks.find((t: { id: string }) => t.id === movers).dependsOn).toEqual([])
  })
})

describeDb("transactions (4-1)", () => {
  it("commits all writes together, or none when the transaction fails", async () => {
    const { withTransaction, getDb } = await import("@/adapters/db")
    const col = (await getDb()).collection("txn_probe")
    await withTransaction(async (session) => {
      await col.insertOne({ n: 1 }, { session })
      await col.insertOne({ n: 2 }, { session })
    })
    expect(await col.countDocuments()).toBe(2)

    await expect(
      withTransaction(async (session) => {
        await col.insertOne({ n: 3 }, { session })
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
    expect(await col.countDocuments()).toBe(2) // the insert before the failure was rolled back
  })
})

describeDb("reminders and messages routes", () => {
  it("ignores server-owned reminder fields and normalizes dueAt to UTC", async () => {
    const missionId = await createMissionAs("user-rem")
    const res = await createReminderRoute(
      req("POST", "/api/reminders", {
        missionId,
        title: "Call the landlord",
        dueAt: "2026-09-01T09:00:00+03:00",
        status: "sent",
        read: true,
        id: "chosen-id",
      }),
      ctx({})
    )
    expect(res.status).toBe(201)
    const data = (await res.json()).data
    expect(data).toMatchObject({ status: "scheduled", read: false, dueAt: "2026-09-01T06:00:00.000Z" })
    expect(data.id).not.toBe("chosen-id")

    const badDate = await createReminderRoute(
      req("POST", "/api/reminders", { missionId, title: "x", dueAt: "tomorrow-ish" }),
      ctx({})
    )
    expect(badDate.status).toBe(400)
  })

  it("rejects a reminder linked to a task outside the mission (404)", async () => {
    const missionId = await createMissionAs("user-rem2")
    const res = await createReminderRoute(
      req("POST", "/api/reminders", { missionId, title: "x", dueAt: "2026-09-01", taskId: "not-a-task" }),
      ctx({})
    )
    expect(res.status).toBe(404)
  })

  it("stores client messages as the user's, whatever type/source they claim", async () => {
    const missionId = await createMissionAs("user-msg")
    const res = await createMessageRoute(
      req("POST", `/api/missions/${missionId}/messages`, { text: "I already did that", type: "reasoning", source: "agent" }),
      ctx({ id: missionId })
    )
    expect(res.status).toBe(201)
    expect((await res.json()).data).toMatchObject({ type: "user", source: "user" })

    asUser("user-other")
    const foreign = await createMessageRoute(
      req("POST", `/api/missions/${missionId}/messages`, { text: "hi" }),
      ctx({ id: missionId })
    )
    expect(foreign.status).toBe(404)
    const foreignList = await (
      await listMessagesRoute(req("GET", `/api/missions/${missionId}/messages`), ctx({ id: missionId }))
    ).json()
    expect(foreignList.data).toHaveLength(0)
  })
})

describeDb("dashboard task summary", () => {
  it("counts per mission, lists soonest open dated tasks, and is scoped to the user", async () => {
    const { summarizeTasks } = await import("@/domain/tasks")
    const missionId = await createMissionAs("user-dash")
    const post = (body: Record<string, unknown>) =>
      createTaskRoute(req("POST", `/api/missions/${missionId}/tasks`, body), ctx({ id: missionId }))

    await post({ label: "Later", dueDate: "2026-12-01" })
    await post({ label: "Sooner", dueDate: "2026-11-01" })
    await post({ label: "No date" })
    const doneRes = await post({ label: "Done already", dueDate: "2026-10-01" })
    const doneId = (await doneRes.json()).data.id
    await patchTaskRoute(
      req("PATCH", `/api/missions/${missionId}/tasks/${doneId}`, { completed: true }),
      ctx({ id: missionId, taskId: doneId })
    )

    const summary = await summarizeTasks("user-dash")
    expect(summary.counts[missionId]).toEqual({ total: 4, open: 3 })
    expect(summary.upcoming.map((t) => t.label)).toEqual(["Sooner", "Later"])

    const other = await summarizeTasks("user-dash-other")
    expect(other.counts).toEqual({})
    expect(other.upcoming).toHaveLength(0)
  })
})

describeDb("rate limiting", () => {
  it("counts per subject within a window and resets in the next one", async () => {
    const { consume } = await import("@/adapters/ratelimit")
    const rule = { name: "test-rule", limit: 2, windowMs: 60_000 }
    const t0 = Date.UTC(2026, 9, 11, 12, 0, 5)

    expect((await consume(rule, "alice", t0)).allowed).toBe(true)
    const second = await consume(rule, "alice", t0 + 1000)
    expect(second).toMatchObject({ allowed: true, remaining: 0 })
    const third = await consume(rule, "alice", t0 + 2000)
    expect(third.allowed).toBe(false)
    expect(third.retryAfterSeconds).toBe(53) // window ends at 12:01:00

    expect((await consume(rule, "bob", t0)).allowed).toBe(true) // other subject, own counter
    expect((await consume(rule, "alice", t0 + 60_000)).allowed).toBe(true) // next window
  })

  it("counts concurrent first requests exactly (upsert race)", async () => {
    const { consume } = await import("@/adapters/ratelimit")
    const rule = { name: "test-race", limit: 100, windowMs: 60_000 }
    const results = await Promise.all(Array.from({ length: 12 }, () => consume(rule, "racer")))
    expect(results.map((r) => r.remaining).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => 88 + i)
    )
  })

  it("limits LLM routes per user with 429, Retry-After, and a readable message", async () => {
    asUser("user-llm-limit")
    const statuses: number[] = []
    let last: Response | undefined
    for (let i = 0; i < 7; i++) {
      last = await planRoute(req("POST", "/api/plans", { goal: "Move" }), ctx({}))
      statuses.push(last.status)
    }
    expect(statuses.slice(0, 6)).toEqual(Array(6).fill(503)) // allowed through (AI disabled in tests)
    expect(statuses[6]).toBe(429)
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(await last!.json()).toMatchObject({ code: "rate_limited", error: expect.stringMatching(/try again in/) })

    asUser("user-llm-other") // another user is unaffected
    expect((await planRoute(req("POST", "/api/plans", { goal: "Move" }), ctx({}))).status).toBe(503)
  })
})

describeDb("cron dispatch route", () => {
  it("rejects a missing or wrong bearer token", async () => {
    const noAuth = await cronRemindersRoute(new Request("http://localhost/api/cron/reminders"))
    expect(noAuth.status).toBe(401)

    const wrong = await cronRemindersRoute(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer wrong" },
      })
    )
    expect(wrong.status).toBe(401)
  })

  it("accepts the configured bearer token", async () => {
    const res = await cronRemindersRoute(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    )
    expect(res.status).toBe(200)
  })

  it("claims due in-app reminders only, recording reminder-due", async () => {
    const missionId = await createMissionAs("user-cron")
    for (const channel of ["in-app", "email"]) {
      const res = await createReminderRoute(
        req("POST", "/api/reminders", { missionId, title: `due ${channel}`, dueAt: "2020-01-01T00:00:00Z", channel }),
        ctx({})
      )
      expect(res.status).toBe(201)
    }

    const res = await cronRemindersRoute(
      new Request("http://localhost/api/cron/reminders", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    )
    expect(res.status).toBe(200)

    const reminders = (
      await (await listRemindersRoute(req("GET", `/api/reminders?missionId=${missionId}`), ctx({}))).json()
    ).data as { channel: string; status: string }[]
    expect(reminders.find((r) => r.channel === "in-app")?.status).toBe("sent")
    expect(reminders.find((r) => r.channel === "email")?.status).toBe("scheduled")

    const events = await (
      await listEventsRoute(req("GET", `/api/missions/${missionId}/events`), ctx({ id: missionId }))
    ).json()
    expect(events.data.filter((e: { type: string }) => e.type === "reminder-due")).toHaveLength(1)
  })
})
