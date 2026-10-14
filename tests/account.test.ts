/**
 * Account deletion, export and retention (delivery plan 7-5; FR-AUTH-3/4,
 * 04-SECURITY §6), against a real MongoDB and the local document store.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { existsSync } from "node:fs"
import { ObjectId } from "mongodb"

/** Requires TEST_MONGODB_URI (see tests/routes.test.ts); skipped without it. */
const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: "someone@test.dev" } } : null),
}))

import { DELETE as deleteAccountRoute } from "@/app/api/account/route"
import { GET as exportRoute } from "@/app/api/account/export/route"
import { GET as maintenanceRoute } from "@/app/api/cron/maintenance/route"
import { GET as listMissionsRoute } from "@/app/api/missions/route"
import { closeClient, getDb } from "@/adapters/db"
import { localPath, localStore, writeLocalObject } from "@/adapters/storage/local"
import { COLLECTIONS } from "@/domain/collections"
import { createMission } from "@/domain/missions"
import { createTask } from "@/domain/tasks"
import { createReminder } from "@/domain/reminders"
import { dispatchDueReminders } from "@/domain/dispatch"
import { updateNotificationPreferences } from "@/domain/preferences"
import { createProposal } from "@/domain/proposals"
import { pruneExpiredRecords } from "@/domain/retention"
import { parseServerEnv } from "@/lib/env"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_acct_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  process.env.CRON_SECRET = "test-cron-secret"
  delete process.env.GEMINI_API_KEY
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
    headers: { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const ctx = () => ({ params: Promise.resolve({}) })

/** A user with data in every collection, as the app would create it. */
async function seedUser(email: string) {
  const db = await getDb()
  const _id = new ObjectId()
  const userId = _id.toHexString()
  await db.collection("users").insertOne({ _id, email, name: "Traveller", emailVerified: null })
  await db.collection("accounts").insertOne({ userId: _id, provider: "google", providerAccountId: `g-${userId}`, type: "oidc" })
  await db.collection("sessions").insertOne({ userId: _id, sessionToken: `tok-${userId}`, expires: new Date(Date.now() + 86_400_000) })
  await db.collection("verification_tokens").insertOne({ identifier: email, token: `vt-${userId}`, expires: new Date() })

  const mission = await createMission(userId, { title: "Move to Berlin" })
  const task = await createTask(userId, mission.id, { label: "Apply for the visa", dueDate: "2999-01-10" }) // + task reminder
  await createReminder(userId, { missionId: mission.id, title: "Call the bank", dueAt: "2020-01-01T09:00:00Z" })
  await dispatchDueReminders({ mailer: null }) // dispatch log rows + reminder-sent event
  await updateNotificationPreferences(userId, { leadDays: 2 })
  await createProposal(userId, { plan: { title: "x", summary: "y", phases: [] } as never, request: { goal: "x" }, promptVersion: "t", model: "t", attempts: 1 })
  await db.collection(COLLECTIONS.messages).insertOne({ id: `m-${userId}`, userId, missionId: mission.id, type: "user", text: "hi", createdAt: new Date().toISOString() })
  await db.collection(COLLECTIONS.pendingActions).insertOne({ id: `pa-${userId}`, userId, missionId: mission.id, status: "pending", expiresAt: new Date() })
  await db.collection(COLLECTIONS.replanProposals).insertOne({ id: `rp-${userId}`, userId, missionId: mission.id, status: "proposed" })

  // A document with its file, and an upload that never completed (file present, no document).
  const docKey = `${userId}/${mission.id}/doc.pdf`
  await writeLocalObject(docKey, Buffer.from("%PDF-1.4 passport"), "application/pdf")
  await db.collection(COLLECTIONS.documents).insertOne({ id: `d-${userId}`, userId, missionId: mission.id, name: "passport.pdf", storageUrl: `local:${docKey}`, createdAt: new Date().toISOString() })
  const orphanKey = `${userId}/${mission.id}/orphan.png`
  await writeLocalObject(orphanKey, Buffer.from("png"), "image/png")
  await db.collection(COLLECTIONS.uploads).insertOne({ id: `u-${userId}`, userId, missionId: mission.id, store: "local", key: orphanKey, status: "pending", expiresAt: new Date() })

  // Rate-limit counters, by making an authenticated request.
  currentUserId = userId
  expect((await listMissionsRoute(req("GET", "/api/missions"), ctx())).status).toBe(200)
  return { userId, _id, missionId: mission.id, taskId: task!.id, docKey, orphanKey }
}

/** Every document in every collection that mentions the user — by string id, ObjectId or email. */
async function traces(userId: string, email: string) {
  const db = await getDb()
  const found: string[] = []
  for (const { name } of await db.listCollections().toArray()) {
    for (const doc of await db.collection(name).find({}).toArray()) {
      const text = JSON.stringify(doc)
      if (text.includes(userId) || text.includes(email)) found.push(`${name}: ${text.slice(0, 120)}`)
    }
  }
  return found
}

describeDb("account deletion", () => {
  it("removes all of the user's data and files, and nobody else's (exit gate)", async () => {
    const victim = await seedUser("leaving@example.com")
    const bystander = await seedUser("staying@example.com")
    expect((await traces(victim.userId, "leaving@example.com")).length).toBeGreaterThan(15)
    expect(existsSync(localPath(victim.docKey))).toBe(true)

    currentUserId = victim.userId
    const res = await deleteAccountRoute(req("DELETE", "/api/account", { confirm: "delete my account" }), ctx())
    expect(res.status).toBe(200)

    expect(await traces(victim.userId, "leaving@example.com")).toEqual([])
    expect(existsSync(localPath(victim.docKey))).toBe(false)
    expect(existsSync(localPath(victim.orphanKey))).toBe(false)
    expect(existsSync(localPath(victim.userId))).toBe(false)

    // The bystander is untouched.
    const db = await getDb()
    expect(await db.collection("sessions").countDocuments({ userId: bystander._id })).toBe(1)
    expect(await db.collection(COLLECTIONS.tasks).countDocuments({ userId: bystander.userId })).toBe(1)
    expect(existsSync(localPath(bystander.docKey))).toBe(true)

    // Deleting again is harmless.
    expect((await deleteAccountRoute(req("DELETE", "/api/account", { confirm: "delete my account" }), ctx())).status).toBe(200)
  })

  it("needs the exact confirmation phrase and a session", async () => {
    const user = await seedUser("careful@example.com")
    currentUserId = user.userId
    for (const body of [undefined, {}, { confirm: "yes" }, { confirm: "DELETE MY ACCOUNT" }]) {
      expect((await deleteAccountRoute(req("DELETE", "/api/account", body), ctx())).status).toBe(400)
    }
    expect(await (await getDb()).collection(COLLECTIONS.missions).countDocuments({ userId: user.userId })).toBe(1)

    currentUserId = null
    expect((await deleteAccountRoute(req("DELETE", "/api/account", { confirm: "delete my account" }), ctx())).status).toBe(401)
  })

  it("if the files can't be deleted, deletes nothing else and says so", async () => {
    const user = await seedUser("stuck@example.com")
    const spy = vi.spyOn(localStore, "deletePrefix").mockRejectedValueOnce(new Error("disk on fire"))
    try {
      currentUserId = user.userId
      const res = await deleteAccountRoute(req("DELETE", "/api/account", { confirm: "delete my account" }), ctx())
      expect(res.status).toBe(503)
      expect((await res.json()).error).toMatch(/nothing else was deleted/)
      const db = await getDb()
      expect(await db.collection("sessions").countDocuments({ userId: user._id })).toBe(1)
      expect(await db.collection(COLLECTIONS.documents).countDocuments({ userId: user.userId })).toBe(1)
    } finally {
      spy.mockRestore()
    }
    // A retry succeeds.
    expect((await deleteAccountRoute(req("DELETE", "/api/account", { confirm: "delete my account" }), ctx())).status).toBe(200)
    expect(await traces(user.userId, "stuck@example.com")).toEqual([])
  })
})

describeDb("data export", () => {
  it("returns the user's data, and only theirs, as a JSON download", async () => {
    const me = await seedUser("exporter@example.com")
    const other = await seedUser("someone-else@example.com")

    currentUserId = me.userId
    const res = await exportRoute(req("GET", "/api/account/export"), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="velora-export-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.headers.get("cache-control")).toBe("no-store")
    const data = await res.json()
    expect(data).toMatchObject({ format: "velora-export", version: 1, account: { email: "exporter@example.com", createdVia: ["google"] } })
    expect(data.missions).toEqual([expect.objectContaining({ id: me.missionId, title: "Move to Berlin" })])
    expect(data.tasks).toEqual([expect.objectContaining({ id: me.taskId })])
    expect(data.documents).toEqual([expect.objectContaining({ name: "passport.pdf" })])
    for (const key of ["messages", "reminders", "reminder_dispatches", "events", "user_settings", "plan_proposals"]) {
      expect(data[key].length, key).toBeGreaterThan(0)
    }
    const text = JSON.stringify(data)
    expect(text).not.toContain(other.userId)
    expect(text).not.toContain("someone-else@example.com")
    expect(text).not.toContain('"_id"')
    expect(text).not.toContain("tok-") // session tokens are never exported

    currentUserId = null
    expect((await exportRoute(req("GET", "/api/account/export"), ctx())).status).toBe(401)
  })
})

describeDb("retention", () => {
  it("prunes old messages, events and dispatch log entries; keeps recent ones and the mission itself", async () => {
    const db = await getDb()
    const now = new Date("2027-06-01T00:00:00Z")
    const old = "2026-05-01T00:00:00.000Z" // 13 months before
    const recent = "2027-05-01T00:00:00.000Z"
    for (const [name, field] of [[COLLECTIONS.messages, "createdAt"], [COLLECTIONS.events, "createdAt"], [COLLECTIONS.reminderDispatches, "at"]] as const) {
      await db.collection(name).insertMany([
        { id: `old-${name}`, userId: "ret-user", [field]: old },
        { id: `new-${name}`, userId: "ret-user", [field]: recent },
      ])
    }
    await db.collection(COLLECTIONS.missions).insertOne({ id: "ret-mission", userId: "ret-user", createdAt: old })

    const pruned = await pruneExpiredRecords({ retentionDays: 365, now })
    expect(pruned.messages).toBeGreaterThanOrEqual(1)
    for (const name of [COLLECTIONS.messages, COLLECTIONS.events, COLLECTIONS.reminderDispatches]) {
      expect(await db.collection(name).countDocuments({ id: `old-${name}` })).toBe(0)
      expect(await db.collection(name).countDocuments({ id: `new-${name}` })).toBe(1)
    }
    expect(await db.collection(COLLECTIONS.missions).countDocuments({ id: "ret-mission" })).toBe(1)
  })

  it("the maintenance endpoint needs the cron secret", async () => {
    expect((await maintenanceRoute(new Request("http://localhost/api/cron/maintenance"))).status).toBe(401)
    const res = await maintenanceRoute(
      new Request("http://localhost/api/cron/maintenance", { headers: { authorization: "Bearer test-cron-secret" } })
    )
    expect(res.status).toBe(200)
    expect((await res.json()).data.pruned).toEqual(expect.objectContaining({ messages: expect.any(Number) }))
  })
})

describe("EVENT_RETENTION_DAYS", () => {
  const base = { MONGODB_URI: "mongodb://x", AUTH_SECRET: "x".repeat(32), AUTH_GOOGLE_ID: "a", AUTH_GOOGLE_SECRET: "b" }
  it("defaults to a year, treats empty as unset, and refuses less than 30 days", () => {
    expect(parseServerEnv(base).EVENT_RETENTION_DAYS).toBe(365)
    expect(parseServerEnv({ ...base, EVENT_RETENTION_DAYS: "" }).EVENT_RETENTION_DAYS).toBe(365)
    expect(parseServerEnv({ ...base, EVENT_RETENTION_DAYS: "90" }).EVENT_RETENTION_DAYS).toBe(90)
    expect(() => parseServerEnv({ ...base, EVENT_RETENTION_DAYS: "7" })).toThrow(/EVENT_RETENTION_DAYS/)
  })
})
