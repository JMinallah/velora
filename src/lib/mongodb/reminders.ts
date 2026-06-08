import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { ReminderRecord } from "./models"
import { createEvent } from "./events"

export async function createReminder(input: Partial<ReminderRecord>): Promise<ReminderRecord> {
  const db = await getDb()
  const now = new Date().toISOString()

  if (!input.missionId || !input.title || !input.dueAt) {
    throw new Error("missionId, title and dueAt are required to create a reminder")
  }

  const reminder: ReminderRecord = {
    id: input.id ?? uuidv4(),
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

  await db.collection(COLLECTIONS.reminders).insertOne(reminder)

  // create an event for the reminder creation
  try {
    await createEvent({ missionId: reminder.missionId, type: "reminder-created", actor: "system", payload: { reminderId: reminder.id, title: reminder.title, channel: reminder.channel } })
  } catch (err) {
    console.error("Failed to emit reminder-created event", err)
  }

  return reminder
}

export async function listReminders(filter?: { missionId?: string; status?: ReminderRecord['status'] }): Promise<ReminderRecord[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filter?.missionId) query.missionId = filter.missionId
  if (filter?.status) query.status = filter.status

  return await db.collection<ReminderRecord>(COLLECTIONS.reminders).find(query).sort({ dueAt: 1 }).toArray()
}

export async function markRemindersRead(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0
  const db = await getDb()
  const res = await db.collection(COLLECTIONS.reminders).updateMany({ id: { $in: ids } }, { $set: { read: true, updatedAt: new Date().toISOString() } })
  return res.modifiedCount
}

export async function markReminderSent(id: string): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.reminders).updateOne({ id }, { $set: { status: "sent", updatedAt: new Date().toISOString() } })
}

export async function findDueReminders(limit = 100): Promise<ReminderRecord[]> {
  const db = await getDb()
  const now = new Date().toISOString()
  return await db.collection<ReminderRecord>(COLLECTIONS.reminders).find({ dueAt: { $lte: now }, status: "scheduled" }).sort({ dueAt: 1 }).limit(limit).toArray()
}
