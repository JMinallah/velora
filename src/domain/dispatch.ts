import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { MailerError, type Mailer } from "@/adapters/email"
import type { ReminderChannel } from "@/types"
import {
  COLLECTIONS,
  type MissionRecord,
  type ReminderDispatchRecord,
  type ReminderRecord,
  type TaskRecord,
} from "./collections"
import { emitEvent } from "./events"
import { getNotificationPreferences, getUserEmail } from "./preferences"
import { renderReminderEmail } from "./reminder-copy"

/**
 * The reminder dispatcher (delivery plan 6-1, FR-REM-2), run by a scheduler
 * calling GET /api/cron/reminders.
 *
 * Idempotent by construction:
 * - each reminder is claimed atomically (scheduled → sending), so concurrent
 *   or repeated runs never pick up the same reminder twice;
 * - channels that already received it are recorded and never sent again;
 * - every email carries an idempotency key, so even a run that crashes after
 *   sending but before recording it cannot cause a second email when the
 *   claim is recovered.
 *
 * A failed email is retried with backoff and finally marked failed; every
 * attempt on every channel is written to the dispatch log.
 */

export const MAX_ATTEMPTS = 3
/** Wait before attempt 2 and attempt 3. */
export const RETRY_BACKOFF_MS = [5 * 60_000, 30 * 60_000]
/** A claim older than this is presumed dead (the run crashed) and can be taken over. */
export const CLAIM_LEASE_MS = 10 * 60_000

export type DispatchSummary = {
  runId: string
  claimed: number
  sent: number
  retrying: number
  failed: number
  skipped: number
  cancelled: number
  errors: number
}

type Options = {
  mailer: Mailer | null
  appUrl?: string
  now?: Date
  maxReminders?: number
  /** Stop claiming new reminders after this long (serverless time limits). */
  timeBudgetMs?: number
}

type Claimed = ReminderRecord & { claimId: string }

export async function dispatchDueReminders(options: Options): Promise<DispatchSummary> {
  const db = await getDb()
  const reminders = db.collection<Claimed>(COLLECTIONS.reminders)
  const runId = uuidv4()
  const summary: DispatchSummary = { runId, claimed: 0, sent: 0, retrying: 0, failed: 0, skipped: 0, cancelled: 0, errors: 0 }
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString()
  const max = options.maxReminders ?? 50
  const deadline = Date.now() + (options.timeBudgetMs ?? 25_000)

  while (summary.claimed < max && Date.now() < deadline) {
    const claimId = uuidv4()
    const reminder = await reminders.findOneAndUpdate(
      {
        $or: [
          {
            status: "scheduled",
            dueAt: { $lte: nowIso },
            $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: nowIso } }],
          },
          { status: "sending", claimedAt: { $lte: staleBefore } },
        ],
      },
      { $set: { status: "sending", claimedAt: nowIso, claimId, updatedAt: nowIso }, $inc: { attempts: 1 } },
      { sort: { dueAt: 1 }, returnDocument: "after", projection: { _id: 0 } }
    )
    if (!reminder) break
    summary.claimed++
    try {
      const outcome = await deliver(reminder, { runId, now, mailer: options.mailer, appUrl: options.appUrl })
      summary[outcome]++
    } catch (err) {
      // Left in "sending": the lease expires and a later run picks it up.
      summary.errors++
      console.error("reminder dispatch error", { reminderId: reminder.id, error: err instanceof Error ? err.message : err })
    }
  }
  return summary
}

type Context = { runId: string; now: Date; mailer: Mailer | null; appUrl?: string }
type Outcome = "sent" | "retrying" | "failed" | "skipped" | "cancelled"

async function deliver(reminder: Claimed, ctx: Context): Promise<Outcome> {
  const db = await getDb()
  const nowIso = ctx.now.toISOString()
  const attempt = reminder.attempts ?? 1
  const log: ReminderDispatchRecord[] = []
  const record = (entry: Pick<ReminderDispatchRecord, "channel" | "outcome" | "reason" | "providerId">) =>
    log.push({
      id: uuidv4(),
      userId: reminder.userId,
      missionId: reminder.missionId,
      reminderId: reminder.id,
      runId: ctx.runId,
      attempt,
      at: nowIso,
      ...entry,
    })

  const finish = async (set: Partial<ReminderRecord>, unset: string[] = []) => {
    await db.collection<Claimed>(COLLECTIONS.reminders).updateOne(
      // Only while the claim is still ours: a run that lost its lease must not overwrite the new owner's result.
      { userId: reminder.userId, id: reminder.id, status: "sending", claimId: reminder.claimId },
      {
        $set: { ...set, updatedAt: nowIso },
        $unset: Object.fromEntries(["claimId", "claimedAt", ...unset].map((field) => [field, ""])),
      }
    )
    if (log.length) await db.collection<ReminderDispatchRecord>(COLLECTIONS.reminderDispatches).insertMany(log)
  }

  // Never send a reminder that no longer applies.
  const mission = await db
    .collection<MissionRecord>(COLLECTIONS.missions)
    .findOne({ userId: reminder.userId, id: reminder.missionId }, { projection: { title: 1 } })
  let stale: string | null = mission ? null : "mission no longer exists"
  if (!stale && reminder.kind === "task-due") {
    const task = await db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .findOne({ userId: reminder.userId, missionId: reminder.missionId, id: reminder.taskId }, { projection: { completed: 1, dueDate: 1 } })
    if (!task) stale = "task no longer exists"
    else if (task.completed) stale = "task already completed"
    else if (task.dueDate?.slice(0, 10) !== reminder.taskDueDate) stale = "task due date changed"
  }
  if (stale) {
    record({ channel: "none", outcome: "cancelled", reason: stale })
    await finish({ status: "cancelled" })
    return "cancelled"
  }

  const prefs = await getNotificationPreferences(reminder.userId)
  const delivered = new Set<ReminderChannel>(reminder.delivered ?? [])
  const wanted: ReminderChannel[] = [...(prefs.inApp ? (["in-app"] as const) : []), ...(prefs.email ? (["email"] as const) : [])]
  if (wanted.length === 0 && delivered.size === 0) {
    record({ channel: "none", outcome: "skipped", reason: "all notification channels are off" })
    await finish({ status: "skipped" })
    return "skipped"
  }

  // In-app delivery is the reminder itself becoming visible in the inbox.
  if (wanted.includes("in-app") && !delivered.has("in-app")) {
    delivered.add("in-app")
    record({ channel: "in-app", outcome: "sent" })
  }

  let emailError: MailerError | null = null
  if (wanted.includes("email") && !delivered.has("email")) {
    const to = ctx.mailer ? await getUserEmail(reminder.userId) : null
    if (!ctx.mailer) record({ channel: "email", outcome: "skipped", reason: "email is not configured" })
    else if (!to) record({ channel: "email", outcome: "skipped", reason: "no email address on the account" })
    else {
      try {
        const copy = renderReminderEmail({ reminder, missionTitle: mission!.title, appUrl: ctx.appUrl })
        const { id } = await ctx.mailer.send({ to, ...copy, idempotencyKey: `reminder-${reminder.id}-${reminder.dueAt}` })
        delivered.add("email")
        record({ channel: "email", outcome: "sent", providerId: id })
      } catch (err) {
        emailError = err instanceof MailerError ? err : new MailerError(err instanceof Error ? err.message : "send failed", true)
        record({ channel: "email", outcome: "failed", reason: emailError.message })
      }
    }
  }

  const deliveredList = [...delivered]
  if (emailError && emailError.retryable && attempt < MAX_ATTEMPTS) {
    const wait = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]
    await finish({
      status: "scheduled",
      delivered: deliveredList,
      lastError: emailError.message,
      nextAttemptAt: new Date(ctx.now.getTime() + wait).toISOString(),
    })
    return "retrying"
  }
  if (emailError) {
    await finish({ status: "failed", delivered: deliveredList, lastError: emailError.message }, ["nextAttemptAt"])
    await emitEvent(reminder.userId, {
      missionId: reminder.missionId,
      type: "reminder-failed",
      actor: "system",
      payload: { reminderId: reminder.id, title: reminder.title, attempts: attempt, reason: emailError.message, delivered: deliveredList },
    })
    return "failed"
  }
  if (deliveredList.length === 0) {
    await finish({ status: "skipped" }, ["nextAttemptAt"])
    return "skipped"
  }
  await finish({ status: "sent", delivered: deliveredList, sentAt: nowIso }, ["nextAttemptAt", "lastError"])
  await emitEvent(reminder.userId, {
    missionId: reminder.missionId,
    type: "reminder-sent",
    actor: "system",
    payload: { reminderId: reminder.id, title: reminder.title, channels: deliveredList },
  })
  return "sent"
}

/** A reminder's dispatch log, oldest first. */
export async function listDispatches(userId: string, reminderId: string): Promise<ReminderDispatchRecord[]> {
  const db = await getDb()
  return db
    .collection<ReminderDispatchRecord>(COLLECTIONS.reminderDispatches)
    .find({ userId, reminderId }, { projection: { _id: 0 } })
    .sort({ at: 1 })
    .toArray()
}
