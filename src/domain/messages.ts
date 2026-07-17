import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type MessageRecord } from "./collections"

export async function listMessages(userId: string, missionId: string): Promise<MessageRecord[]> {
  const db = await getDb()
  return db
    .collection<MessageRecord>(COLLECTIONS.messages)
    .find({ userId, missionId })
    .sort({ createdAt: 1 })
    .toArray()
}

export async function createMessage(
  userId: string,
  input: Partial<Omit<MessageRecord, "userId">>
): Promise<MessageRecord> {
  const db = await getDb()
  const msg: MessageRecord = {
    id: input.id ?? uuidv4(),
    userId,
    missionId: input.missionId,
    type: input.type ?? "reasoning",
    text: input.text ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    extractedData: input.extractedData,
    source: input.source ?? "agent",
  }
  await db.collection<MessageRecord>(COLLECTIONS.messages).insertOne(msg)
  return msg
}
