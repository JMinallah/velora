import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { TaskRecord } from "./models"

export async function listTasksForMission(missionId: string): Promise<TaskRecord[]> {
  const db = await getDb()
  return await db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .find({ missionId })
    .sort({ createdAt: 1 })
    .toArray()
}

export async function createTask(input: Partial<TaskRecord>): Promise<TaskRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const task: TaskRecord = {
    id: input.id ?? uuidv4(),
    missionId: input.missionId as string,
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

  await db.collection(COLLECTIONS.tasks).insertOne(task)
  return task
}

export async function updateTaskStatus(missionId: string, taskId: string, completed: boolean): Promise<TaskRecord | null> {
  const db = await getDb()
  const now = new Date().toISOString()
  const result = await db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .findOneAndUpdate({ missionId, id: taskId }, { $set: { completed, updatedAt: now } }, { returnDocument: "after" })

  return result.value
}
