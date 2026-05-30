import type { Message } from "@/types"

export const COLLECTIONS = {
  missions: "missions",
  tasks: "tasks",
  messages: "messages",
  reminders: "reminders",
  documents: "documents",
  events: "events",
  users: "users",
}

export type MissionRecord = {
  id: string
  title: string
  subtitle?: string
  phase?: string
  status?: "On track" | "Watch" | "At risk"
  overview?: string
  nextStep?: string
  createdAt: string
  updatedAt: string
  source?: "onboarding" | "agent" | "manual"
}

export type TaskRecord = {
  id: string
  missionId: string
  category: string
  label: string
  completed: boolean
  dueDate?: string | null
  priority?: "low" | "medium" | "high"
  risk?: "low" | "medium" | "high"
  source?: "agent" | "user" | "import"
  createdAt: string
  updatedAt: string
}

export type MessageRecord = Message

export type DocumentRecord = {
  id: string
  missionId: string
  name: string
  mimeType: string
  storageUrl: string
  extractedText?: string
  summary?: string
  extractedFields?: Record<string, string>
  createdAt: string
}

export type ReminderRecord = {
  id: string
  missionId: string
  taskId?: string
  title: string
  details?: string
  dueAt: string
  channel?: "in-app" | "email" | "push"
  status?: "scheduled" | "sent" | "dismissed"
  createdAt: string
  updatedAt?: string
}

export type EventRecord = {
  id: string
  missionId: string
  type:
    | "mission-created"
    | "mission-updated"
    | "task-created"
    | "task-updated"
    | "document-attached"
    | "reminder-created"
    | "risk-updated"
    | "replan-generated"
  actor: "user" | "agent" | "system"
  payload: Record<string, unknown>
  createdAt: string | Date
}

export type UserRecord = {
  id: string
  email: string
  name?: string
  passwordHash: string
  role?: "user" | "admin"
  createdAt: string
}
