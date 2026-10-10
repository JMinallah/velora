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
import { POST as planRoute } from "@/app/api/plan/route"
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
    const res = await planRoute(req("POST", "/api/plan", { goal: "Move to Seoul" }), ctx({}))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe("agent_disabled")

    asUser(null)
    const anon = await planRoute(req("POST", "/api/plan", { goal: "Move to Seoul" }), ctx({}))
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
