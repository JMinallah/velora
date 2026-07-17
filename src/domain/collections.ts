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
