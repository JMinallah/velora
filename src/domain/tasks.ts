import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type TaskRecord } from "./collections"
import { emitEvent } from "./events"
import { getMission } from "./missions"

type Actor = "user" | "agent" | "system"

export async function listTasks(userId: string, missionId: string): Promise<TaskRecord[]> {
  const db = await getDb()
  return db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .find({ userId, missionId })
    .sort({ createdAt: 1 })
    .toArray()
}

export async function getTask(
  userId: string,
  missionId: string,
  taskId: string
): Promise<TaskRecord | null> {
  const db = await getDb()
  return db.collection<TaskRecord>(COLLECTIONS.tasks).findOne({ userId, missionId, id: taskId })
}

/** Returns null when the mission doesn't exist or isn't the caller's (renders as 404). */
export async function createTask(
  userId: string,
  missionId: string,
  input: Partial<Omit<TaskRecord, "userId" | "missionId">>,
  actor: Actor = "user"
): Promise<TaskRecord | null> {
  const mission = await getMission(userId, missionId)
  if (!mission) return null

  const db = await getDb()
  const now = new Date().toISOString()
  const task: TaskRecord = {
    id: input.id ?? uuidv4(),
    userId,
    missionId,
    category: input.category ?? "General",
    label: input.label ?? "",
    completed: input.completed ?? false,
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? "medium",
    risk: input.risk ?? "low",
    source: input.source ?? "user",
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<TaskRecord>(COLLECTIONS.tasks).insertOne(task)
  await emitEvent(userId, {
    missionId,
    type: "task-created",
    actor,
    payload: { taskId: task.id, label: task.label, dueDate: task.dueDate },
  })
  return task
}

export async function updateTask(
  userId: string,
  missionId: string,
  taskId: string,
  patch: Partial<Omit<TaskRecord, "id" | "userId" | "missionId" | "createdAt">>,
  actor: Actor = "user"
): Promise<TaskRecord | null> {
  const db = await getDb()
  const now = new Date().toISOString()
  const updated = await db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .findOneAndUpdate(
      { userId, missionId, id: taskId },
      { $set: { ...patch, updatedAt: now } },
      { returnDocument: "after" }
    )

  if (updated) {
    await emitEvent(userId, {
      missionId,
      type: "task-updated",
      actor,
      payload: { taskId, fields: Object.keys(patch) },
    })
  }
  return updated
}

export async function deleteTask(
  userId: string,
  missionId: string,
  taskId: string,
  actor: Actor = "user"
): Promise<boolean> {
  const db = await getDb()
  const task = await getTask(userId, missionId, taskId)
  if (!task) return false

  await db.collection<TaskRecord>(COLLECTIONS.tasks).deleteOne({ userId, missionId, id: taskId })
  await emitEvent(userId, {
    missionId,
    type: "task-deleted",
    actor,
    payload: { taskId, label: task.label },
  })
  return true
}

/** Shifts due dates of open tasks by N days (used by re-planning). */
export async function shiftTaskDates(
  userId: string,
  missionId: string,
  days: number,
  actor: Actor = "user"
): Promise<number> {
  const db = await getDb()
  const now = new Date().toISOString()
  const tasks = await listTasks(userId, missionId)

  let modified = 0
  for (const task of tasks) {
    if (!task.dueDate || task.completed) continue
    const due = new Date(task.dueDate)
    due.setDate(due.getDate() + days)
    const res = await db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .updateOne(
        { userId, missionId, id: task.id },
        { $set: { dueDate: due.toISOString(), updatedAt: now } }
      )
    modified += res.modifiedCount
  }

  if (modified > 0) {
    await emitEvent(userId, {
      missionId,
      type: "task-updated",
      actor,
      payload: { action: "shift-dates", days, modified },
    })
  }
  return modified
}
