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

export async function updateDocument(id: string, patch: Partial<DocumentRecord>): Promise<DocumentRecord | null> {
  const db = await getDb()
  const update: Partial<DocumentRecord> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.mimeType !== undefined) update.mimeType = patch.mimeType
  if (patch.storageUrl !== undefined) update.storageUrl = patch.storageUrl
  if (patch.extractedText !== undefined) update.extractedText = patch.extractedText
  if (patch.summary !== undefined) update.summary = patch.summary
  if (patch.extractedFields !== undefined) update.extractedFields = patch.extractedFields

  const res = await db
    .collection<DocumentRecord>(COLLECTIONS.documents)
    .findOneAndUpdate({ id }, { $set: update }, { returnDocument: "after" })

  return res.value ?? null
}
