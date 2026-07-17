import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type ReminderRecord } from "./collections"
import { emitEvent } from "./events"
import { getMission } from "./missions"

type Actor = "user" | "agent" | "system"

/** Returns null when the mission doesn't exist or isn't the caller's (renders as 404). */
export async function createReminder(
  userId: string,
  input: Partial<Omit<ReminderRecord, "userId">> &
    Pick<ReminderRecord, "missionId" | "title" | "dueAt">,
  actor: Actor = "user"
): Promise<ReminderRecord | null> {
  const mission = await getMission(userId, input.missionId)
  if (!mission) return null

  const db = await getDb()
  const now = new Date().toISOString()
  const reminder: ReminderRecord = {
    id: input.id ?? uuidv4(),
    userId,
    missionId: input.missionId,
    taskId: input.taskId,
    title: input.title,
    details: input.details,
    dueAt: input.dueAt,
    channel: input.channel ?? "in-app",
    status: input.status ?? "scheduled",
    read: input.read ?? false,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<ReminderRecord>(COLLECTIONS.reminders).insertOne(reminder)
  await emitEvent(userId, {
    missionId: reminder.missionId,
    type: "reminder-created",
    actor,
    payload: { reminderId: reminder.id, title: reminder.title, channel: reminder.channel },
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
