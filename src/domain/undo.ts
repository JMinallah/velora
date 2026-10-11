import { getDb } from "@/adapters/db"
import { COLLECTIONS, type EventRecord, type ReminderRecord, type TaskRecord } from "./collections"
import { emitEvent } from "./events"

/**
 * Undo for the agent's writes (FR-AGT-6, delivery plan 3-4).
 *
 * Undo works like a stack: only the agent's most recent not-yet-undone change
 * in a mission can be undone; after that, the one before it becomes undoable.
 * Each reversal is a single conditional write keyed on the record's
 * `updatedAt` right after the agent's change — if the user has edited the
 * record since, nothing is written and undo explains why. That same
 * condition makes concurrent undos safe: only one can match.
 */

export type UndoableChange = { eventId: string; description: string; at: string }

function describe(event: EventRecord): string {
  const undo = event.undo!
  switch (undo.kind) {
    case "delete-task":
      return `Created task "${undo.label}"`
    case "restore-task":
      return event.cause?.tool === "completeTask"
        ? `${(event.cause.args as { completed?: boolean })?.completed === false ? "Reopened" : "Completed"} task "${undo.label}"`
        : `Updated task "${undo.label}"`
    case "delete-reminder":
      return `Scheduled reminder "${undo.label}"`
  }
}

export async function latestUndoable(userId: string, missionId: string): Promise<UndoableChange | null> {
  const events = (await getDb()).collection<EventRecord>(COLLECTIONS.events)
  const undone = new Set(
    (await events.find({ userId, missionId, type: "change-undone" }, { projection: { payload: 1 } }).toArray()).map(
      (e) => e.payload.eventId as string
    )
  )
  const candidates = events
    .find({ userId, missionId, undo: { $exists: true } }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
  for await (const event of candidates) {
    if (!undone.has(event.id)) return { eventId: event.id, description: describe(event), at: event.createdAt }
  }
  return null
}

export type UndoOutcome =
  | { kind: "undone"; description: string; taskId?: string }
  | { kind: "nothing" }
  | { kind: "not_latest" }
  | { kind: "conflict"; message: string }

export async function undoChange(userId: string, missionId: string, eventId: string): Promise<UndoOutcome> {
  const latest = await latestUndoable(userId, missionId)
  if (!latest) return { kind: "nothing" }
  if (latest.eventId !== eventId) return { kind: "not_latest" }

  const db = await getDb()
  const event = await db.collection<EventRecord>(COLLECTIONS.events).findOne({ userId, missionId, id: eventId })
  const undo = event?.undo
  if (!event || !undo) return { kind: "nothing" }

  const editedSince = (what: string) => ({
    kind: "conflict" as const,
    message: `Can't undo: ${what} has changed since Velora's change, so undoing would overwrite your edits.`,
  })

  let taskId: string | undefined
  if (undo.kind === "delete-task") {
    const res = await db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .deleteOne({ userId, missionId, id: undo.taskId, updatedAt: undo.afterUpdatedAt })
    if (res.deletedCount !== 1) return editedSince(`task "${undo.label}"`)
    taskId = undo.taskId
  } else if (undo.kind === "restore-task") {
    // replaceOne keeps the document's _id, so the task is byte-identical to
    // its pre-image — including updatedAt.
    const res = await db
      .collection<TaskRecord>(COLLECTIONS.tasks)
      .replaceOne({ userId, missionId, id: undo.taskId, updatedAt: undo.afterUpdatedAt }, undo.before)
    if (res.matchedCount !== 1) return editedSince(`task "${undo.label}"`)
    taskId = undo.taskId
  } else {
    const res = await db
      .collection<ReminderRecord>(COLLECTIONS.reminders)
      .deleteOne({ userId, missionId, id: undo.reminderId, updatedAt: undo.afterUpdatedAt, status: "scheduled" })
    if (res.deletedCount !== 1) return editedSince(`reminder "${undo.label}"`)
  }

  const description = describe(event)
  await emitEvent(userId, {
    missionId,
    type: "change-undone",
    actor: "user",
    payload: { eventId, undid: description },
  })
  return { kind: "undone", description, taskId }
}
