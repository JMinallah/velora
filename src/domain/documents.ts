import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type DocumentRecord } from "./collections"
import { emitEvent } from "./events"
import { getMission } from "./missions"

type Actor = "user" | "agent" | "system"

export async function listDocuments(userId: string, missionId: string): Promise<DocumentRecord[]> {
  const db = await getDb()
  return db.collection<DocumentRecord>(COLLECTIONS.documents).find({ userId, missionId }).toArray()
}

/** Returns null when the mission doesn't exist or isn't the caller's (renders as 404). */
export async function attachDocument(
  userId: string,
  missionId: string,
  input: Partial<Omit<DocumentRecord, "userId" | "missionId">>,
  actor: Actor = "user"
): Promise<DocumentRecord | null> {
  const mission = await getMission(userId, missionId)
  if (!mission) return null

  const db = await getDb()
  const doc: DocumentRecord = {
    id: input.id ?? uuidv4(),
    userId,
    missionId,
    name: input.name ?? "",
    mimeType: input.mimeType ?? "application/octet-stream",
    storageUrl: input.storageUrl ?? "",
    extractedText: input.extractedText ?? "",
    summary: input.summary ?? "",
    extractedFields: input.extractedFields ?? {},
    createdAt: new Date().toISOString(),
  }

  await db.collection<DocumentRecord>(COLLECTIONS.documents).insertOne(doc)
  await emitEvent(userId, {
    missionId,
    type: "document-attached",
    actor,
    payload: { documentId: doc.id, name: doc.name, mimeType: doc.mimeType },
  })
  return doc
}

export async function updateDocument(
  userId: string,
  id: string,
  patch: Partial<
    Pick<DocumentRecord, "name" | "mimeType" | "storageUrl" | "extractedText" | "summary" | "extractedFields">
  >
): Promise<DocumentRecord | null> {
  const db = await getDb()
  return db
    .collection<DocumentRecord>(COLLECTIONS.documents)
    .findOneAndUpdate({ userId, id }, { $set: patch }, { returnDocument: "after" })
}
