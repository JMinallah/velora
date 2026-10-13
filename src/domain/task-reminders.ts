import { v4 as uuidv4 } from "uuid"
import { MongoBulkWriteError, type AnyBulkWriteOperation } from "mongodb"
import { getDb } from "@/adapters/db"
import { localTimeToUtc } from "@/lib/dates"
import type { NotificationPreferences } from "@/types"
import { COLLECTIONS, type ReminderRecord, type TaskRecord } from "./collections"
import { getNotificationPreferences } from "./preferences"

/**
 * Task-driven reminders (FR-REM-1, delivery plan 6-2): every open task with
 * a due date has one reminder, at 09:00 in the user's time zone, `leadDays`
 * before the due date — or on the day itself when that is already past.
 *
 * Reminders are derived state, so instead of patching them at each write
 * site, every task write calls `syncTaskReminders` for its mission, which
 * recomputes what should exist and fixes the difference: idempotent, and
 * correct whatever path changed the tasks (manual edits, agent tools, plan
 * and re-plan acceptance, undo). They emit no audit events — the task change
 * that caused them already has one. The dispatcher re-checks the task before
 * sending, so even a missed sync can't send a reminder that no longer applies.
 */

export const TASK_REMINDER_HOUR = 9

type TaskFacts = Pick<TaskRecord, "id" | "label" | "dueDate" | "completed">

/** When this task's reminder should fire, or null when it shouldn't have one (yet). */
export function taskReminderTime(task: TaskFacts, prefs: NotificationPreferences, now: Date): Date | null {
  if (!prefs.taskReminders || task.completed || !task.dueDate) return null
  for (const daysBefore of prefs.leadDays > 0 ? [prefs.leadDays, 0] : [0]) {
    const at = localTimeToUtc(task.dueDate, TASK_REMINDER_HOUR, prefs.timeZone, daysBefore)
    if (at && at.getTime() > now.getTime()) return at
  }
  return null
}

export async function syncTaskReminders(userId: string, missionId: string, now = new Date()): Promise<void> {
  const db = await getDb()
  const prefs = await getNotificationPreferences(userId)
  const reminders = db.collection<ReminderRecord>(COLLECTIONS.reminders)
  const [tasks, existing] = await Promise.all([
    db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .find({ userId, missionId }, { projection: { _id: 0, id: 1, label: 1, dueDate: 1, completed: 1 } })
      .toArray(),
    reminders.find({ userId, missionId, kind: "task-due" }, { projection: { _id: 0 } }).toArray(),
  ])
  const byTask = new Map(existing.map((r) => [r.taskId, r]))
  const nowIso = now.toISOString()
  const ops: AnyBulkWriteOperation<ReminderRecord>[] = []
  const cancel = (r: ReminderRecord) =>
    ops.push({ updateOne: { filter: { userId, id: r.id, status: "scheduled" }, update: { $set: { status: "cancelled", updatedAt: nowIso } } } })

  for (const task of tasks as TaskFacts[]) {
    const current = byTask.get(task.id)
    byTask.delete(task.id)
    const at = taskReminderTime(task, prefs, now)
    if (!at) {
      if (current?.status === "scheduled") cancel(current)
      continue
    }
    const fields = { dueAt: at.toISOString(), taskDueDate: task.dueDate!.slice(0, 10), title: task.label }

    if (!current) {
      ops.push({
        insertOne: {
          document: {
            id: uuidv4(),
            userId,
            missionId,
            taskId: task.id,
            kind: "task-due",
            ...fields,
            status: "scheduled",
            attempts: 0,
            delivered: [],
            read: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        },
      })
    } else if (current.status === "scheduled") {
      if (current.dueAt !== fields.dueAt || current.taskDueDate !== fields.taskDueDate || current.title !== fields.title) {
        ops.push({
          updateOne: {
            filter: { userId, id: current.id, status: "scheduled" },
            update: { $set: { ...fields, attempts: 0, updatedAt: nowIso }, $unset: { nextAttemptAt: "", lastError: "" } },
          },
        })
      }
    } else if (current.status !== "sending" && (current.status === "cancelled" || current.taskDueDate !== fields.taskDueDate)) {
      // Already handled for an earlier due date (or called off): a new due
      // date, or a reopened task, gets a fresh reminder.
      ops.push({
        updateOne: {
          filter: { userId, id: current.id, status: current.status },
          update: {
            $set: { ...fields, status: "scheduled", attempts: 0, delivered: [], read: false, updatedAt: nowIso },
            $unset: { nextAttemptAt: "", lastError: "", sentAt: "" },
          },
        },
      })
    }
  }
  // Tasks that no longer exist.
  for (const orphan of byTask.values()) if (orphan.status === "scheduled") cancel(orphan)

  if (ops.length === 0) return
  try {
    await reminders.bulkWrite(ops, { ordered: false })
  } catch (err) {
    // A concurrent sync inserted the same task's reminder first (unique index): that one stands.
    const duplicatesOnly =
      err instanceof MongoBulkWriteError &&
      (Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors]).every((e) => e.code === 11000)
    if (!duplicatesOnly) throw err
  }
}

/** For write paths: a reminder problem must never fail the task change itself. */
export async function syncTaskRemindersSafely(userId: string, missionId: string): Promise<void> {
  try {
    await syncTaskReminders(userId, missionId)
  } catch (err) {
    console.error("task reminder sync failed", { missionId, error: err instanceof Error ? err.message : err })
  }
}

/** After a preference change that moves reminder times (lead time, time zone, on/off). */
export async function syncAllTaskReminders(userId: string): Promise<void> {
  const db = await getDb()
  const missions = await db
    .collection<{ id: string; userId: string }>(COLLECTIONS.missions)
    .find({ userId }, { projection: { _id: 0, id: 1 } })
    .toArray()
  for (const mission of missions) await syncTaskReminders(userId, mission.id)
}
