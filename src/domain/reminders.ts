import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type ReminderRecord } from "./collections"
import { emitEvent, type ChangeOrigin } from "./events"
import { getMission } from "./missions"
import { getTask } from "./tasks"

type Actor = ChangeOrigin

/**
 * Returns null when the mission (or the linked task) doesn't exist or isn't
 * the caller's (renders as 404). dueAt is stored as a UTC ISO string because
 * the dispatcher compares it to "now" as a string. Delivery channels are
 * decided at send time by the user's notification preferences.
 */
export async function createReminder(
  userId: string,
  input: Partial<Omit<ReminderRecord, "userId">> &
    Pick<ReminderRecord, "missionId" | "title" | "dueAt">,
  actor: Actor = "user"
): Promise<ReminderRecord | null> {
  const mission = await getMission(userId, input.missionId)
  if (!mission) return null
  if (input.taskId && !(await getTask(userId, input.missionId, input.taskId))) return null

  const dueAt = new Date(input.dueAt)
  if (Number.isNaN(dueAt.getTime())) throw new Error(`invalid dueAt: ${input.dueAt}`)

  const db = await getDb()
  const now = new Date().toISOString()
  const reminder: ReminderRecord = {
    id: input.id ?? uuidv4(),
    userId,
    missionId: input.missionId,
    taskId: input.taskId,
    kind: "custom",
    title: input.title,
    details: input.details,
    dueAt: dueAt.toISOString(),
    status: "scheduled",
    attempts: 0,
    delivered: [],
    read: false,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<ReminderRecord>(COLLECTIONS.reminders).insertOne({ ...reminder })
  await emitEvent(userId, {
    missionId: reminder.missionId,
    type: "reminder-created",
    actor,
    payload: { reminderId: reminder.id, title: reminder.title, dueAt: reminder.dueAt },
    undo: { kind: "delete-reminder", reminderId: reminder.id, label: reminder.title, afterUpdatedAt: now },
  })
  return reminder
}

export async function listReminders(
  userId: string,
  filter?: { missionId?: string; status?: ReminderRecord["status"] }
): Promise<ReminderRecord[]> {
  const db = await getDb()
  const query: Record<string, unknown> = { userId }
  if (filter?.missionId) query.missionId = filter.missionId
  if (filter?.status) query.status = filter.status
  return db.collection<ReminderRecord>(COLLECTIONS.reminders).find(query).sort({ dueAt: 1 }).toArray()
}

export async function markRemindersRead(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const db = await getDb()
  const res = await db
    .collection<ReminderRecord>(COLLECTIONS.reminders)
    .updateMany({ userId, id: { $in: ids } }, { $set: { read: true, updatedAt: new Date().toISOString() } })
  return res.modifiedCount
}

/**
 * The in-app inbox: reminders the dispatcher has delivered in the app,
 * newest first. Scheduled reminders aren't notifications yet.
 */
export async function listNotifications(
  userId: string,
  limit = 30
): Promise<{ items: ReminderRecord[]; unread: number }> {
  const db = await getDb()
  const reminders = db.collection<ReminderRecord>(COLLECTIONS.reminders)
  const query = { userId, delivered: "in-app" as const }
  const [items, unread] = await Promise.all([
    reminders.find(query, { projection: { _id: 0 } }).sort({ sentAt: -1, dueAt: -1 }).limit(limit).toArray(),
    reminders.countDocuments({ ...query, read: { $ne: true } }),
  ])
  return { items, unread }
}
