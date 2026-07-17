import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type MissionRecord } from "./collections"
import { emitEvent } from "./events"

type Actor = "user" | "agent" | "system"

export async function listMissions(userId: string): Promise<MissionRecord[]> {
  const db = await getDb()
  return db
    .collection<MissionRecord>(COLLECTIONS.missions)
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray()
}

export async function getMission(userId: string, id: string): Promise<MissionRecord | null> {
  const db = await getDb()
  return db.collection<MissionRecord>(COLLECTIONS.missions).findOne({ userId, id })
}

export async function createMission(
  userId: string,
  input: Partial<Omit<MissionRecord, "userId">>,
  actor: Actor = "user"
): Promise<MissionRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const mission: MissionRecord = {
    id: input.id ?? uuidv4(),
    userId,
    title: input.title ?? "Untitled Mission",
    subtitle: input.subtitle,
    phase: input.phase,
    status: input.status ?? "On track",
    overview: input.overview ?? "",
    nextStep: input.nextStep ?? "",
    createdAt: now,
    updatedAt: now,
    source: input.source ?? "manual",
  }

  await db.collection<MissionRecord>(COLLECTIONS.missions).insertOne(mission)
  await emitEvent(userId, {
    missionId: mission.id,
    type: "mission-created",
    actor,
    payload: { title: mission.title, source: mission.source },
  })
  return mission
}

export async function updateMission(
  userId: string,
  id: string,
  patch: Partial<Omit<MissionRecord, "id" | "userId" | "createdAt">>,
  actor: Actor = "user"
): Promise<MissionRecord | null> {
  const db = await getDb()
  const now = new Date().toISOString()
  const updated = await db
    .collection<MissionRecord>(COLLECTIONS.missions)
    .findOneAndUpdate(
      { userId, id },
      { $set: { ...patch, updatedAt: now } },
      { returnDocument: "after" }
    )

  if (updated) {
    await emitEvent(userId, {
      missionId: id,
      type: "mission-updated",
      actor,
      payload: { fields: Object.keys(patch) },
    })
  }
  return updated
}

/** Deletes a mission and everything belonging to it, then records the deletion. */
export async function deleteMission(
  userId: string,
  id: string,
  actor: Actor = "user"
): Promise<boolean> {
  const db = await getDb()
  const mission = await getMission(userId, id)
  if (!mission) return false

  await Promise.all([
    db.collection(COLLECTIONS.tasks).deleteMany({ userId, missionId: id }),
    db.collection(COLLECTIONS.messages).deleteMany({ userId, missionId: id }),
    db.collection(COLLECTIONS.reminders).deleteMany({ userId, missionId: id }),
    db.collection(COLLECTIONS.documents).deleteMany({ userId, missionId: id }),
  ])
  await db.collection<MissionRecord>(COLLECTIONS.missions).deleteOne({ userId, id })

  await emitEvent(userId, {
    missionId: id,
    type: "mission-deleted",
    actor,
    payload: { title: mission.title },
  })
  return true
}
