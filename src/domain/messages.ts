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
    ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.replan ? { replan: input.replan } : {}),
  }
  await db.collection<MessageRecord>(COLLECTIONS.messages).insertOne(msg)
  return msg
}

/** Keeps a stored confirmation card in step with the user's decision. */
export async function setConfirmationStatus(
  userId: string,
  actionId: string,
  status: NonNullable<MessageRecord["action"]>["status"]
): Promise<void> {
  const db = await getDb()
  await db
    .collection<MessageRecord>(COLLECTIONS.messages)
    .updateOne({ userId, type: "confirmation", "action.id": actionId }, { $set: { "action.status": status } })
}
