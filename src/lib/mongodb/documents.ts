import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { DocumentRecord } from "./models"

export async function attachDocument(input: Partial<DocumentRecord>): Promise<DocumentRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const doc: DocumentRecord = {
    id: input.id ?? uuidv4(),
    missionId: input.missionId as string,
    name: input.name ?? "",
    mimeType: input.mimeType ?? "application/octet-stream",
    storageUrl: input.storageUrl ?? "",
    extractedText: input.extractedText ?? "",
    summary: input.summary ?? "",
    extractedFields: input.extractedFields ?? {},
    createdAt: now,
  }

  await db.collection(COLLECTIONS.documents).insertOne(doc)
  return doc
}

export async function listDocumentsForMission(missionId: string): Promise<DocumentRecord[]> {
  const db = await getDb()
  return await db.collection<DocumentRecord>(COLLECTIONS.documents).find({ missionId }).toArray()
}
