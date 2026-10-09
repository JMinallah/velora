import type { Message, Mission, Task, Document, Reminder, Event } from "@/types"

export const COLLECTIONS = {
  missions: "missions",
  tasks: "tasks",
  messages: "messages",
  reminders: "reminders",
  documents: "documents",
  events: "events",
} as const

export type MissionRecord = Mission
export type TaskRecord = Task
export type MessageRecord = Message
export type DocumentRecord = Document
export type ReminderRecord = Reminder
export type EventRecord = Event

const PROTECTED_FIELDS = ["_id", "id", "userId", "missionId", "createdAt"]

/**
 * Drops ownership and identity fields from an update patch. Routes validate
 * input first; this is the domain layer's own guarantee that no caller can
 * re-home or re-key a record through $set, whatever reaches it at runtime.
 */
export function withoutProtectedFields<T extends object>(patch: T): T {
  const out = { ...patch } as Record<string, unknown>
  for (const key of PROTECTED_FIELDS) delete out[key]
  return out as T
}
