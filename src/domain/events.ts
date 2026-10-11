import type { ClientSession } from "mongodb"
import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type EventRecord } from "./collections"

/**
 * Who made a change. Agent changes made from chat carry the turn and the
 * validated tool call that caused them, so every agent change in the
 * activity feed links back to the user message behind it (FR-TRS-2).
 */
export type ChangeOrigin =
  | EventRecord["actor"]
  | { actor: "agent"; turnId: string; tool: string; args: unknown; confirmedBy?: "user" }

/**
 * The append-only audit trail (docs/02-ARCHITECTURE.md §3.1): every domain
 * mutation emits an event through here. Events are never updated or deleted
 * by application code; retention pruning is the only writer besides insert.
 */
export async function emitEvent(
  userId: string,
  input: {
    missionId: string
    type: EventRecord["type"]
    actor: ChangeOrigin
    payload?: Record<string, unknown>
    /** Stored only for agent changes — user changes are not undoable through the agent's undo. */
    undo?: EventRecord["undo"]
  },
  options: { session?: ClientSession } = {}
): Promise<EventRecord> {
  const db = await getDb()
  const origin = input.actor
  const event: EventRecord = {
    id: uuidv4(),
    userId,
    missionId: input.missionId,
    type: input.type,
    actor: typeof origin === "string" ? origin : origin.actor,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
    ...(typeof origin === "string"
      ? {}
      : {
          turnId: origin.turnId,
          cause: { tool: origin.tool, args: origin.args },
          ...(origin.confirmedBy ? { confirmedBy: origin.confirmedBy } : {}),
          ...(input.undo ? { undo: input.undo } : {}),
        }),
  }
  await db.collection<EventRecord>(COLLECTIONS.events).insertOne({ ...event }, { session: options.session })
  return event
}

export async function listEvents(userId: string, missionId: string): Promise<EventRecord[]> {
  const db = await getDb()
  return db
    .collection<EventRecord>(COLLECTIONS.events)
    .find({ userId, missionId })
    .sort({ createdAt: 1 })
    .toArray()
}
