/**
 * Reminders & notifications (delivery plan Phase 6): the dispatcher's
 * lifecycle, idempotency, retries and dispatch log; notification
 * preferences; the in-app inbox; the email adapters and copy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import type { EmailMessage, Mailer } from "@/adapters/email"

/** Requires TEST_MONGODB_URI (see tests/routes.test.ts); DB tests are skipped without it. */
const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null),
}))

let mailer: Mailer | null = null
vi.mock("@/adapters/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adapters/email")>()),
  getMailer: () => mailer,
}))

import { MailerError } from "@/adapters/email"
import { resendMailer } from "@/adapters/email/resend"
import { GET as cronRoute } from "@/app/api/cron/reminders/route"
import { GET as notificationsRoute, PATCH as markNotificationsRoute } from "@/app/api/notifications/route"
import { GET as getPrefsRoute, PATCH as patchPrefsRoute } from "@/app/api/settings/notifications/route"
import { GET as listEventsRoute } from "@/app/api/missions/[id]/events/route"
import { closeClient, getDb } from "@/adapters/db"
import { COLLECTIONS, type ReminderRecord } from "@/domain/collections"
import { createMission } from "@/domain/missions"
import { createReminder } from "@/domain/reminders"
import { dispatchDueReminders, listDispatches, CLAIM_LEASE_MS } from "@/domain/dispatch"
import { renderReminderEmail } from "@/domain/reminder-copy"
import { localTimeToUtc } from "@/lib/dates"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_rem_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "test-client-id"
  process.env.AUTH_GOOGLE_SECRET = "test-client-secret"
  process.env.CRON_SECRET = "test-cron-secret"
  delete process.env.GEMINI_API_KEY
  await getDb() // creates the indexes up front, outside any one test's timeout
})

afterAll(async () => {
  if (!TEST_URI) return
  await (await getDb()).dropDatabase()
  await closeClient()
})

beforeEach(() => {
  mailer = null
})

const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "x-forwarded-for": `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) })
const cron = () => cronRoute(new Request("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer test-cron-secret" } }))

/** A mailer that records what it sends; `fail` decides per call whether to throw. */
function recordingMailer(fail?: (call: number) => MailerError | null, delayMs = 0) {
  const sent: EmailMessage[] = []
  let calls = 0
  const m: Mailer = {
    name: "test",
    async send(message) {
      calls++
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      const error = fail?.(calls)
      if (error) throw error
      sent.push(message)
      return { id: `msg-${sent.length}` }
    },
  }
  return { mailer: m, sent, calls: () => calls }
}

/** A real-looking account: Auth.js users have ObjectId ids and the email lives there. */
async function newUser(email = "traveller@example.com"): Promise<string> {
  const _id = new ObjectId()
  await (await getDb()).collection(COLLECTIONS.users).insertOne({ _id, email, name: "T" })
  return _id.toHexString()
}

async function dueReminder(userId: string, title = "Book the flight") {
  const mission = await createMission(userId, { title: "Move to Berlin" })
  const reminder = await createReminder(userId, { missionId: mission.id, title, dueAt: "2020-01-01T09:00:00Z" })
  return { missionId: mission.id, reminder: reminder! }
}

async function reminderById(id: string) {
  return (await getDb()).collection<ReminderRecord>(COLLECTIONS.reminders).findOne({ id }, { projection: { _id: 0 } })
}

/** Only this test's reminders: other tests' due reminders share the database. */
async function onlyDue(userId: string) {
  await (await getDb()).collection(COLLECTIONS.reminders).updateMany(
    { userId: { $ne: userId }, status: { $in: ["scheduled", "sending"] } },
    { $set: { status: "cancelled" } }
  )
}

describeDb("reminder dispatcher", () => {
  it("double-fired dispatcher sends exactly one email per reminder (exit gate)", async () => {
    const userId = await newUser()
    const a = await dueReminder(userId, "Book the flight")
    const b = await dueReminder(userId, "Renew the passport")
    await onlyDue(userId)
    const rec = recordingMailer(undefined, 30)
    mailer = rec.mailer

    // Two schedulers firing at once (e.g. GitHub Actions and the host's cron).
    const [first, second] = await Promise.all([cron(), cron()])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const claimed = [(await first.json()).data.claimed, (await second.json()).data.claimed]
    expect(claimed[0] + claimed[1]).toBe(2)

    expect(rec.sent).toHaveLength(2)
    expect(new Set(rec.sent.map((m) => m.idempotencyKey)).size).toBe(2)
    expect(rec.sent.every((m) => m.to === "traveller@example.com")).toBe(true)

    // A third run finds nothing to do.
    expect((await (await cron()).json()).data.claimed).toBe(0)
    expect(rec.sent).toHaveLength(2)

    for (const { reminder, missionId } of [a, b]) {
      const after = await reminderById(reminder.id)
      expect(after).toMatchObject({ status: "sent", attempts: 1, delivered: ["in-app", "email"] })
      expect(after).not.toHaveProperty("claimId")
      const log = await listDispatches(userId, reminder.id)
      expect(log.map((d) => [d.channel, d.outcome])).toEqual([["in-app", "sent"], ["email", "sent"]])

      currentUserId = userId
      const events = (await (await listEventsRoute(req("GET", `/api/missions/${missionId}/events`), ctx({ id: missionId }))).json()).data
      expect(events.filter((e: { type: string }) => e.type === "reminder-sent")).toHaveLength(1)
    }
  })

  it("retries a failed email with backoff, then marks it failed — visible in the dispatch log (exit gate)", async () => {
    const userId = await newUser()
    const { reminder, missionId } = await dueReminder(userId)
    await onlyDue(userId)
    const rec = recordingMailer(() => new MailerError("resend 503", true))
    const t0 = new Date("2026-10-13T10:00:00Z")
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000)

    let summary = await dispatchDueReminders({ mailer: rec.mailer, now: t0 })
    expect(summary).toMatchObject({ claimed: 1, retrying: 1 })
    expect(await reminderById(reminder.id)).toMatchObject({
      status: "scheduled",
      attempts: 1,
      delivered: ["in-app"],
      lastError: "resend 503",
      nextAttemptAt: at(5).toISOString(),
    })

    // Not before the backoff has passed.
    summary = await dispatchDueReminders({ mailer: rec.mailer, now: at(4) })
    expect(summary.claimed).toBe(0)

    summary = await dispatchDueReminders({ mailer: rec.mailer, now: at(5) })
    expect(summary).toMatchObject({ claimed: 1, retrying: 1 })
    expect((await reminderById(reminder.id))?.nextAttemptAt).toBe(at(35).toISOString())

    summary = await dispatchDueReminders({ mailer: rec.mailer, now: at(35) })
    expect(summary).toMatchObject({ claimed: 1, failed: 1 })
    const after = await reminderById(reminder.id)
    expect(after).toMatchObject({ status: "failed", attempts: 3, delivered: ["in-app"], lastError: "resend 503" })
    expect(after?.nextAttemptAt).toBeUndefined()
    expect(rec.calls()).toBe(3)

    // Failed for good: later runs leave it alone.
    expect((await dispatchDueReminders({ mailer: rec.mailer, now: at(600) })).claimed).toBe(0)

    const log = await listDispatches(userId, reminder.id)
    expect(log.map((d) => [d.attempt, d.channel, d.outcome])).toEqual([
      [1, "in-app", "sent"],
      [1, "email", "failed"],
      [2, "email", "failed"],
      [3, "email", "failed"],
    ])
    expect(log.filter((d) => d.outcome === "failed").every((d) => d.reason === "resend 503")).toBe(true)
    // The log never holds the address or the message.
    expect(JSON.stringify(log)).not.toContain("traveller@example.com")

    currentUserId = userId
    const events = (await (await listEventsRoute(req("GET", `/api/missions/${missionId}/events`), ctx({ id: missionId }))).json()).data
    expect(events.find((e: { type: string }) => e.type === "reminder-failed")?.payload).toMatchObject({ attempts: 3, reason: "resend 503" })
  })

  it("a retry that succeeds sends the email once and doesn't repeat the in-app notification", async () => {
    const userId = await newUser()
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    const rec = recordingMailer((call) => (call === 1 ? new MailerError("resend 429", true) : null))
    const t0 = new Date("2026-10-13T10:00:00Z")

    await dispatchDueReminders({ mailer: rec.mailer, now: t0 })
    await dispatchDueReminders({ mailer: rec.mailer, now: new Date(t0.getTime() + 5 * 60_000) })

    expect(rec.sent).toHaveLength(1)
    expect(await reminderById(reminder.id)).toMatchObject({ status: "sent", attempts: 2, delivered: ["in-app", "email"] })
    const log = await listDispatches(userId, reminder.id)
    expect(log.filter((d) => d.channel === "in-app")).toHaveLength(1)
  })

  it("does not retry an email the provider rejects for good", async () => {
    const userId = await newUser()
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    const rec = recordingMailer(() => new MailerError("resend 422 validation_error", false))

    expect(await dispatchDueReminders({ mailer: rec.mailer })).toMatchObject({ claimed: 1, failed: 1 })
    expect(await reminderById(reminder.id)).toMatchObject({ status: "failed", attempts: 1 })
    expect(rec.calls()).toBe(1)
  })

  it("takes over a claim whose run died, with the same idempotency key", async () => {
    const userId = await newUser()
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    const now = new Date()
    // A run claimed it and crashed before recording the result.
    await (await getDb()).collection(COLLECTIONS.reminders).updateOne(
      { id: reminder.id },
      { $set: { status: "sending", attempts: 1, claimId: "dead-run", claimedAt: new Date(now.getTime() - CLAIM_LEASE_MS - 1000).toISOString() } }
    )
    const rec = recordingMailer()

    expect((await dispatchDueReminders({ mailer: rec.mailer, now })).claimed).toBe(1)
    expect(rec.sent.map((m) => m.idempotencyKey)).toEqual([`reminder-${reminder.id}-${reminder.dueAt}`])
    expect(await reminderById(reminder.id)).toMatchObject({ status: "sent", attempts: 2 })
  })

  it("leaves a fresh claim alone", async () => {
    const userId = await newUser()
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    await (await getDb()).collection(COLLECTIONS.reminders).updateOne(
      { id: reminder.id },
      { $set: { status: "sending", claimId: "live-run", claimedAt: new Date().toISOString() } }
    )
    expect((await dispatchDueReminders({ mailer: recordingMailer().mailer })).claimed).toBe(0)
  })

  it("never sends a reminder dated in the future", async () => {
    const userId = await newUser()
    const mission = await createMission(userId, { title: "Later" })
    await onlyDue(userId)
    const future = await createReminder(userId, { missionId: mission.id, title: "Later", dueAt: "2999-01-01T00:00:00Z" })
    expect((await dispatchDueReminders({ mailer: recordingMailer().mailer })).claimed).toBe(0)
    expect((await reminderById(future!.id))?.status).toBe("scheduled")
  })

  it("without an email transport, delivers in the app and logs the email as skipped — never as sent", async () => {
    const userId = await newUser()
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)

    expect(await dispatchDueReminders({ mailer: null })).toMatchObject({ sent: 1 })
    expect(await reminderById(reminder.id)).toMatchObject({ status: "sent", delivered: ["in-app"] })
    const log = await listDispatches(userId, reminder.id)
    expect(log.find((d) => d.channel === "email")).toMatchObject({ outcome: "skipped", reason: "email is not configured" })
  })

  it("skips email for an account without an address", async () => {
    const userId = "no-address-user"
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    const rec = recordingMailer()

    await dispatchDueReminders({ mailer: rec.mailer })
    expect(rec.calls()).toBe(0)
    const log = await listDispatches(userId, reminder.id)
    expect(log.find((d) => d.channel === "email")).toMatchObject({ outcome: "skipped", reason: "no email address on the account" })
  })
})

describeDb("notification preferences", () => {
  it("are honored: email off sends no email; everything off sends nothing (exit gate)", async () => {
    const userId = await newUser()
    currentUserId = userId
    const rec = recordingMailer()

    expect((await patchPrefsRoute(req("PATCH", "/api/settings/notifications", { email: false }), ctx({}))).status).toBe(200)
    const emailOff = await dueReminder(userId)
    await onlyDue(userId)
    await dispatchDueReminders({ mailer: rec.mailer })
    expect(rec.calls()).toBe(0)
    expect(await reminderById(emailOff.reminder.id)).toMatchObject({ status: "sent", delivered: ["in-app"] })

    expect((await patchPrefsRoute(req("PATCH", "/api/settings/notifications", { inApp: false }), ctx({}))).status).toBe(200)
    const allOff = await dueReminder(userId)
    await onlyDue(userId)
    await dispatchDueReminders({ mailer: rec.mailer })
    expect(rec.calls()).toBe(0)
    expect(await reminderById(allOff.reminder.id)).toMatchObject({ status: "skipped", delivered: [] })
    expect((await listDispatches(userId, allOff.reminder.id)).map((d) => [d.channel, d.outcome])).toEqual([["none", "skipped"]])

    // Not in the inbox either.
    const inbox = (await (await notificationsRoute(req("GET", "/api/notifications"), ctx({}))).json()).data
    expect(inbox.items.map((n: { id: string }) => n.id)).not.toContain(allOff.reminder.id)
  })

  it("in-app off: emailed but not in the inbox", async () => {
    const userId = await newUser()
    currentUserId = userId
    await patchPrefsRoute(req("PATCH", "/api/settings/notifications", { inApp: false }), ctx({}))
    const { reminder } = await dueReminder(userId)
    await onlyDue(userId)
    const rec = recordingMailer()

    await dispatchDueReminders({ mailer: rec.mailer })
    expect(rec.sent).toHaveLength(1)
    expect(await reminderById(reminder.id)).toMatchObject({ status: "sent", delivered: ["email"] })
    const inbox = (await (await notificationsRoute(req("GET", "/api/notifications"), ctx({}))).json()).data
    expect(inbox.items).toHaveLength(0)
  })

  it("defaults, validation and per-user scoping", async () => {
    currentUserId = null
    expect((await getPrefsRoute(req("GET", "/api/settings/notifications"), ctx({}))).status).toBe(401)

    currentUserId = "prefs-user"
    const defaults = (await (await getPrefsRoute(req("GET", "/api/settings/notifications"), ctx({}))).json()).data
    expect(defaults).toEqual({
      inApp: true,
      email: true,
      taskReminders: true,
      leadDays: 1,
      timeZone: "UTC",
      emailAddress: "prefs-user@test.dev",
    })

    for (const bad of [{ leadDays: 99 }, { leadDays: 1.5 }, { timeZone: "Mars/Olympus" }, { email: "yes" }, { userId: "someone-else" }]) {
      expect((await patchPrefsRoute(req("PATCH", "/api/settings/notifications", bad), ctx({}))).status).toBe(400)
    }

    const saved = (await (await patchPrefsRoute(req("PATCH", "/api/settings/notifications", { leadDays: 3, timeZone: "Africa/Nairobi" }), ctx({}))).json()).data
    expect(saved).toMatchObject({ leadDays: 3, timeZone: "Africa/Nairobi", email: true })

    currentUserId = "prefs-other"
    const other = (await (await getPrefsRoute(req("GET", "/api/settings/notifications"), ctx({}))).json()).data
    expect(other).toMatchObject({ leadDays: 1, timeZone: "UTC" })
  })
})

describeDb("in-app inbox", () => {
  it("lists only delivered reminders, counts unread, and marks only the caller's as read", async () => {
    const userId = await newUser()
    const due = await dueReminder(userId, "Due one")
    const future = await createReminder(userId, { missionId: due.missionId, title: "Future one", dueAt: "2999-01-01T00:00:00Z" })
    await onlyDue(userId)
    await dispatchDueReminders({ mailer: null })

    currentUserId = userId
    let inbox = (await (await notificationsRoute(req("GET", "/api/notifications"), ctx({}))).json()).data
    expect(inbox.items.map((n: { id: string }) => n.id)).toEqual([due.reminder.id])
    expect(inbox.items.map((n: { id: string }) => n.id)).not.toContain(future!.id)
    expect(inbox.unread).toBe(1)

    // Someone else can't mark it read.
    currentUserId = "inbox-intruder"
    const intruder = await markNotificationsRoute(req("PATCH", "/api/notifications", { ids: [due.reminder.id] }), ctx({}))
    expect((await intruder.json()).data.modified).toBe(0)

    currentUserId = userId
    expect((await markNotificationsRoute(req("PATCH", "/api/notifications", { ids: "all" }), ctx({}))).status).toBe(400)
    await markNotificationsRoute(req("PATCH", "/api/notifications", { ids: [due.reminder.id] }), ctx({}))
    inbox = (await (await notificationsRoute(req("GET", "/api/notifications"), ctx({}))).json()).data
    expect(inbox.unread).toBe(0)

    currentUserId = null
    expect((await notificationsRoute(req("GET", "/api/notifications"), ctx({}))).status).toBe(401)
  })
})

describe("reminder email copy", () => {
  it("escapes HTML and keeps the subject on one line", () => {
    const email = renderReminderEmail({
      reminder: { kind: "custom", title: 'Pay <script>alert(1)</script>\nnow', details: "Bring <b>cash</b> & receipts", missionId: "m 1" },
      missionTitle: "Move & settle",
      appUrl: "https://velora.example/",
    })
    expect(email.subject).toBe("Reminder: Pay <script>alert(1)</script> now")
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain("Pay &lt;script&gt;alert(1)&lt;/script&gt; now")
    expect(email.html).toContain("Bring &lt;b&gt;cash&lt;/b&gt; &amp; receipts")
    expect(email.html).toContain('href="https://velora.example/mission/m%201"')
    expect(email.text).toContain("Open it: https://velora.example/mission/m%201")
  })

  it("states a task's due date from stored data, and works without a base URL", () => {
    const email = renderReminderEmail({
      reminder: { kind: "task-due", title: "Submit visa application", taskDueDate: "2026-11-02", missionId: "m1" },
      missionTitle: "Move to Berlin",
    })
    expect(email.subject).toBe("Due Mon, Nov 2, 2026: Submit visa application")
    expect(email.text).not.toContain("http")
    expect(email.html).not.toContain("href")
  })
})

describe("Resend mailer", () => {
  const message: EmailMessage = { to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>", idempotencyKey: "reminder-1-x" }

  it("sends with the idempotency key and returns the provider id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      expect(await resendMailer("key", "Velora <r@example.com>").send(message)).toEqual({ id: "re_123" })
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe("https://api.resend.com/emails")
      expect(init.headers).toMatchObject({ Authorization: "Bearer key", "Idempotency-Key": "reminder-1-x" })
      expect(JSON.parse(init.body as string)).toMatchObject({ from: "Velora <r@example.com>", to: ["a@example.com"] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("classifies failures: 429/5xx/network retryable, other 4xx final", async () => {
    const cases: [() => Promise<Response>, boolean][] = [
      [async () => new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429 }), true],
      [async () => new Response("oops", { status: 502 }), true],
      [async () => Promise.reject(new TypeError("fetch failed")), true],
      [async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 }), false],
      [async () => new Response(JSON.stringify({ name: "invalid_api_key" }), { status: 403 }), false],
    ]
    for (const [impl, retryable] of cases) {
      vi.stubGlobal("fetch", vi.fn(impl))
      try {
        const error = await resendMailer("sk_test_secret", "from").send(message).catch((e) => e)
        expect(error).toBeInstanceOf(MailerError)
        expect(error.retryable).toBe(retryable)
        expect(error.message).not.toContain("sk_test_secret")
      } finally {
        vi.unstubAllGlobals()
      }
    }
  })
})

describe("localTimeToUtc", () => {
  it("converts local 09:00 to UTC, across daylight-saving changes", () => {
    expect(localTimeToUtc("2026-11-02", 9, "UTC")?.toISOString()).toBe("2026-11-02T09:00:00.000Z")
    expect(localTimeToUtc("2026-11-02", 9, "Africa/Nairobi")?.toISOString()).toBe("2026-11-02T06:00:00.000Z")
    // New York: EST (UTC-5) before 8 March 2026, EDT (UTC-4) from it.
    expect(localTimeToUtc("2026-03-07", 9, "America/New_York")?.toISOString()).toBe("2026-03-07T14:00:00.000Z")
    expect(localTimeToUtc("2026-03-08", 9, "America/New_York")?.toISOString()).toBe("2026-03-08T13:00:00.000Z")
    expect(localTimeToUtc("2026-03-09", 9, "America/New_York", 1)?.toISOString()).toBe("2026-03-08T13:00:00.000Z")
    expect(localTimeToUtc("2026-03-01", 9, "Asia/Kolkata", 1)?.toISOString()).toBe("2026-02-28T03:30:00.000Z")
    expect(localTimeToUtc("not a date", 9, "UTC")).toBeNull()
  })
})
