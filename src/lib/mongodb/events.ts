import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { EventRecord } from "./models"

export async function createEvent(input: Partial<EventRecord>): Promise<EventRecord> {
  const db = await getDb()
  const now = new Date()
  const event: EventRecord = {
    id: input.id ?? uuidv4(),
    missionId: input.missionId as string,
    type: (input.type as EventRecord['type']) ?? "mission-updated",
    actor: input.actor ?? "user",
    payload: input.payload ?? {},
    createdAt: now.toISOString(),
  }

  await db.collection(COLLECTIONS.events).insertOne(event)
  return event
}

export async function listEventsForMission(missionId: string): Promise<EventRecord[]> {
  const db = await getDb()
  return await db.collection<EventRecord>(COLLECTIONS.events).find({ missionId }).sort({ createdAt: 1 }).toArray()
}
