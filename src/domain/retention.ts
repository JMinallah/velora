import { getDb } from "@/adapters/db"
import { COLLECTIONS } from "./collections"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Retention (04-SECURITY §6): chat messages, audit events and the reminder
 * dispatch log are deleted once older than the retention period (default
 * 12 months, EVENT_RETENTION_DAYS). Missions, tasks, reminders and
 * documents stay until the user deletes them. Timestamps are ISO strings,
 * which compare correctly as strings — hence a job, not a TTL index.
 */
export async function pruneExpiredRecords(options: { retentionDays: number; now?: Date }): Promise<Record<string, number>> {
  const db = await getDb()
  const cutoff = new Date((options.now ?? new Date()).getTime() - options.retentionDays * DAY_MS).toISOString()
  const [messages, events, dispatches] = await Promise.all([
    db.collection(COLLECTIONS.messages).deleteMany({ createdAt: { $lt: cutoff } }),
    db.collection(COLLECTIONS.events).deleteMany({ createdAt: { $lt: cutoff } }),
    db.collection(COLLECTIONS.reminderDispatches).deleteMany({ at: { $lt: cutoff } }),
  ])
  return { messages: messages.deletedCount, events: events.deletedCount, reminderDispatches: dispatches.deletedCount }
}
