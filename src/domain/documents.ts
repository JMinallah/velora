import { v4 as uuidv4 } from "uuid"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type DocumentRecord } from "./collections"
import { emitEvent, type ChangeOrigin } from "./events"
import { getMission } from "./missions"
import { storeFor } from "@/adapters/storage"

type Actor = ChangeOrigin

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
  >,
  actor: Actor = "user"
): Promise<DocumentRecord | null> {
  const db = await getDb()
  const updated = await db
    .collection<DocumentRecord>(COLLECTIONS.documents)
    .findOneAndUpdate({ userId, id }, { $set: patch }, { returnDocument: "after" })

  if (updated) {
    await emitEvent(userId, {
      missionId: updated.missionId,
      type: "document-updated",
      actor,
      payload: { documentId: id, name: updated.name, fields: Object.keys(patch) },
    })
  }
  return updated
}

export async function getDocument(userId: string, missionId: string, id: string): Promise<DocumentRecord | null> {
  const db = await getDb()
  return db.collection<DocumentRecord>(COLLECTIONS.documents).findOne({ userId, missionId, id }, { projection: { _id: 0 } })
}

/** Deletes the record and its stored file (the bytes are personal data: they must not outlive the record). */
export async function deleteDocument(userId: string, missionId: string, id: string, actor: Actor = "user"): Promise<boolean> {
  const db = await getDb()
  const doc = await db.collection<DocumentRecord>(COLLECTIONS.documents).findOneAndDelete({ userId, missionId, id })
  if (!doc) return false
  await removeStoredFile(doc.storageUrl)
  await emitEvent(userId, { missionId, type: "document-deleted", actor, payload: { documentId: id, name: doc.name } })
  return true
}

/** Best-effort removal of a document's bytes; logs rather than failing the caller. */
export async function removeStoredFile(storageUrl: string | undefined): Promise<void> {
  if (!storageUrl || !/^(local|r2):/.test(storageUrl)) return
  try {
    const { store, key } = storeFor(storageUrl)
    await store.delete(key)
  } catch (error) {
    console.error("failed to delete stored document", error)
  }
}
