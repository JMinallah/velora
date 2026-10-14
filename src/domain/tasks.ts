import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type TaskRecord, withoutProtectedFields } from "./collections"
import { emitEvent, type ChangeOrigin } from "./events"
import { getMission } from "./missions"
import { dependencyProblem } from "./dependencies"
import { syncTaskRemindersSafely } from "./task-reminders"

type Actor = ChangeOrigin

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
    dependsOn: input.dependsOn ?? [],
    ...(input.phase ? { phase: input.phase } : {}),
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<TaskRecord>(COLLECTIONS.tasks).insertOne({ ...task })
  await emitEvent(userId, {
    missionId,
    type: "task-created",
    actor,
    payload: { taskId: task.id, label: task.label, dueDate: task.dueDate },
    undo: { kind: "delete-task", taskId: task.id, label: task.label, afterUpdatedAt: now },
  })
  if (task.dueDate) await syncTaskRemindersSafely(userId, missionId)
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
  const safePatch = withoutProtectedFields(patch)
  // The pre-image comes from the same atomic operation as the write, so undo
  // restores exactly what this change replaced.
  const before = await db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .findOneAndUpdate(
      { userId, missionId, id: taskId },
      { $set: { ...safePatch, updatedAt: now } },
      { returnDocument: "before", projection: { _id: 0 } }
    )
  if (!before) return null
  const updated: TaskRecord = { ...before, ...safePatch, updatedAt: now }

  await emitEvent(userId, {
    missionId,
    type: "task-updated",
    actor,
    payload: { taskId, label: updated.label, fields: Object.keys(safePatch) },
    undo: { kind: "restore-task", taskId, label: before.label, before, afterUpdatedAt: now },
  })
  if ("dueDate" in safePatch || "completed" in safePatch || "label" in safePatch) {
    await syncTaskRemindersSafely(userId, missionId)
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
  // Nothing can wait on a task that no longer exists. A cascade of the
  // deletion (recorded by its task-deleted event), not an edit: updatedAt is
  // left alone so undo snapshots of those tasks stay valid.
  await db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .updateMany({ userId, missionId, dependsOn: taskId }, { $pull: { dependsOn: taskId } })
  await emitEvent(userId, {
    missionId,
    type: "task-deleted",
    actor,
    payload: { taskId, label: task.label },
  })
  if (task.dueDate) await syncTaskRemindersSafely(userId, missionId)
  return true
}

/** Adds N days in UTC, keeping the input's shape: date-only stays date-only. Null if unparseable. */
function shiftDate(value: string, days: number): string | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const due = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(due.getTime())) return null
  due.setUTCDate(due.getUTCDate() + days)
  return dateOnly ? due.toISOString().slice(0, 10) : due.toISOString()
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
    const shifted = shiftDate(task.dueDate, days)
    if (!shifted) continue // unparseable legacy value — leave it rather than crash the whole shift
    const res = await db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .updateOne(
        { userId, missionId, id: task.id },
        { $set: { dueDate: shifted, updatedAt: now } }
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
    await syncTaskRemindersSafely(userId, missionId)
  }
  return modified
}

export type TaskSummary = {
  /** Per mission: total and open task counts. Missions with no tasks are absent. */
  counts: Record<string, { total: number; open: number }>
  /** The user's open tasks with a due date, soonest (including overdue) first. */
  upcoming: TaskRecord[]
}

/** Dashboard data across all of a user's missions in two indexed queries. */
export async function summarizeTasks(userId: string, upcomingLimit = 8): Promise<TaskSummary> {
  const db = await getDb()
  const tasks = db.collection<TaskRecord>(COLLECTIONS.tasks)

  const [grouped, upcoming] = await Promise.all([
    tasks
      .aggregate<{ _id: string; total: number; open: number }>([
        { $match: { userId } },
        {
          $group: {
            _id: "$missionId",
            total: { $sum: 1 },
            open: { $sum: { $cond: ["$completed", 0, 1] } },
          },
        },
      ])
      .toArray(),
    tasks
      .find({ userId, completed: false, dueDate: { $type: "string" } })
      .sort({ dueDate: 1 })
      .limit(upcomingLimit)
      .toArray(),
  ])

  return {
    counts: Object.fromEntries(grouped.map((g) => [g._id, { total: g.total, open: g.open }])),
    upcoming,
  }
}

/**
 * Checks a task's proposed dependency list against the mission (same mission,
 * no self-dependency, no cycle). Returns a user-readable problem or null.
 * Pass the id a new task *will* have to check before creating it.
 */
export async function checkDependencies(
  userId: string,
  missionId: string,
  taskId: string,
  dependsOn: string[]
): Promise<string | null> {
  const tasks = await listTasks(userId, missionId)
  const withThis = tasks.some((t) => t.id === taskId) ? tasks : [...tasks, { id: taskId, label: "this task", dependsOn: [] }]
  return dependencyProblem(taskId, [...new Set(dependsOn)], withThis)
}

export type TaskRiskFacts = Pick<TaskRecord, "id" | "missionId" | "label" | "completed" | "dueDate" | "dependsOn">

/** The fields the risk indicator needs, for all of a user's tasks, in one query (dashboard). */
export async function listTaskRiskFacts(userId: string): Promise<TaskRiskFacts[]> {
  const db = await getDb()
  return db
    .collection<TaskRecord>(COLLECTIONS.tasks)
    .find({ userId }, { projection: { _id: 0, id: 1, missionId: 1, label: 1, completed: 1, dueDate: 1, dependsOn: 1 } })
    .toArray()
}
