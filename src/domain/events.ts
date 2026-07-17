import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type EventRecord } from "./collections"

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
    actor: EventRecord["actor"]
    payload?: Record<string, unknown>
  }
): Promise<EventRecord> {
  const db = await getDb()
  const event: EventRecord = {
    id: uuidv4(),
    userId,
    missionId: input.missionId,
    type: input.type,
    actor: input.actor,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
  }
  await db.collection<EventRecord>(COLLECTIONS.events).insertOne(event)
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
