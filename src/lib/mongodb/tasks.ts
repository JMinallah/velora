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

export async function updateTasks(missionId: string, updates: Array<{ id: string } & Partial<TaskRecord>>): Promise<number> {
  const db = await getDb()
  const now = new Date().toISOString()
  
  let modifiedCount = 0
  for (const update of updates) {
    const { id, ...patch } = update
    const res = await db.collection<TaskRecord>(COLLECTIONS.tasks).updateOne(
      { missionId, id },
      { $set: { ...patch, updatedAt: now } }
    )
    modifiedCount += res.modifiedCount
  }
  
  return modifiedCount
}

export async function getTask(missionId: string, taskId: string): Promise<TaskRecord | null> {
  const db = await getDb()
  return await db.collection<TaskRecord>(COLLECTIONS.tasks).findOne({ missionId, id: taskId })
}

export async function shiftTaskDates(missionId: string, days: number): Promise<number> {
  const db = await getDb()
  const tasks = await listTasksForMission(missionId)
  const now = new Date().toISOString()
  
  let modifiedCount = 0
  for (const task of tasks) {
    if (task.dueDate && !task.completed) {
      const currentDate = new Date(task.dueDate)
      currentDate.setDate(currentDate.getDate() + days)
      const newDueDate = currentDate.toISOString()
      
      const res = await db.collection<TaskRecord>(COLLECTIONS.tasks).updateOne(
        { missionId, id: task.id },
        { $set: { dueDate: newDueDate, updatedAt: now } }
      )
      modifiedCount += res.modifiedCount
    }
  }
  
  return modifiedCount
}

export async function deleteTask(missionId: string, taskId: string): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection<TaskRecord>(COLLECTIONS.tasks).deleteOne({ missionId, id: taskId })
  return result.deletedCount > 0
}
