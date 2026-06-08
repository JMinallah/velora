import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { MessageRecord } from "./models"

export async function listMessagesForMission(missionId: string): Promise<MessageRecord[]> {
  const db = await getDb()
  return await db
    .collection<MessageRecord>(COLLECTIONS.messages)
    .find({ missionId })
    .sort({ createdAt: 1 })
    .toArray()
}

export async function createMessage(input: Partial<MessageRecord>): Promise<MessageRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const msg: MessageRecord = {
    id: input.id ?? uuidv4(),
    missionId: input.missionId as string,
    type: (input.type as MessageRecord['type']) ?? "reasoning",
    text: input.text ?? "",
    createdAt: input.createdAt ?? now,
    extractedData: input.extractedData,
    source: input.source ?? "agent",
  }

  await db.collection(COLLECTIONS.messages).insertOne(msg)
  return msg
}
