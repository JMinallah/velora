import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { MissionRecord } from "./models"

export async function listMissions(): Promise<MissionRecord[]> {
  const db = await getDb()
  const items = await db
    .collection<MissionRecord>(COLLECTIONS.missions)
    .find()
    .sort({ createdAt: -1 })
    .toArray()

  return items
}

export async function getMission(id: string): Promise<MissionRecord | null> {
  const db = await getDb()
  return await db.collection<MissionRecord>(COLLECTIONS.missions).findOne({ id })
}

export async function createMission(input: Partial<MissionRecord>): Promise<MissionRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const mission: MissionRecord = {
    id: input.id ?? uuidv4(),
    title: input.title ?? "Untitled Mission",
    subtitle: input.subtitle,
    phase: input.phase,
    status: input.status ?? "On track",
    overview: input.overview ?? "",
    nextStep: input.nextStep ?? "",
    createdAt: now,
    updatedAt: now,
    source: input.source ?? "onboarding",
  }

  await db.collection(COLLECTIONS.missions).insertOne(mission)
  return mission
}

export async function updateMission(id: string, patch: Partial<MissionRecord>): Promise<MissionRecord | null> {
  const db = await getDb()
  const now = new Date().toISOString()
  const result = await db
    .collection<MissionRecord>(COLLECTIONS.missions)
    .findOneAndUpdate({ id }, { $set: { ...patch, updatedAt: now } }, { returnDocument: "after" })

  return result.value
}
