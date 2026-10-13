import { randomUUID } from "node:crypto"
import { getDb } from "@/adapters/db"
import {
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  UPLOAD_URL_TTL_SECONDS,
  documentStore,
  storeFor,
  type DocumentStore,
} from "@/adapters/storage"
import { COLLECTIONS, type DocumentRecord } from "./collections"
import { attachDocument } from "./documents"
import { getMission } from "./missions"

/**
 * Upload flow (delivery plan 5-2): (1) the server checks type, size and
 * mission ownership and hands out a signed upload URL for a key it chose;
 * (2) the browser PUTs the bytes straight to storage; (3) on "complete" the
 * server checks the stored object really matches what was declared before
 * any document exists. A client never names a storage key.
 */
export type UploadRecord = {
  id: string
  userId: string
  missionId: string
  key: string
  store: DocumentStore["kind"]
  name: string
  contentType: string
  size: number
  status: "pending" | "completed"
  createdAt: string
  expiresAt: Date
}

const uploads = async () => (await getDb()).collection<UploadRecord>(COLLECTIONS.uploads)

export type StartOutcome =
  | { kind: "ok"; uploadId: string; url: string; headers: Record<string, string>; expiresAt: string }
  | { kind: "not_found" }
  | { kind: "unsupported_type" }
  | { kind: "too_large" }

export async function startUpload(
  userId: string,
  missionId: string,
  input: { name: string; contentType: string; size: number }
): Promise<StartOutcome> {
  if (!(await getMission(userId, missionId))) return { kind: "not_found" }
  const extension = DOCUMENT_TYPES[input.contentType]
  if (!extension) return { kind: "unsupported_type" }
  if (input.size > MAX_DOCUMENT_BYTES) return { kind: "too_large" }

  const store = documentStore()
  const id = randomUUID()
  // Server-chosen key, namespaced by owner and mission; the filename is display-only.
  const key = `${userId}/${missionId}/${id}${extension}`
  const signed = await store.createUploadUrl(key, { contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES })
  await (await uploads()).insertOne({
    id,
    userId,
    missionId,
    key,
    store: store.kind,
    name: input.name,
    contentType: input.contentType,
    size: input.size,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
  })
  return { kind: "ok", uploadId: id, url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt }
}

export type CompleteOutcome =
  | { kind: "ok"; document: DocumentRecord }
  | { kind: "not_found" }
  | { kind: "already_completed" }
  | { kind: "missing" }
  | { kind: "mismatch"; message: string }

export async function completeUpload(userId: string, missionId: string, uploadId: string): Promise<CompleteOutcome> {
  const col = await uploads()
  const upload = await col.findOne({ userId, missionId, id: uploadId })
  if (!upload) return { kind: "not_found" }
  if (upload.status === "completed") return { kind: "already_completed" }

  const { store, key } = storeFor(`${upload.store}:${upload.key}`)
  const stored = await store.head(key)
  if (!stored) return { kind: "missing" }
  if (stored.size > MAX_DOCUMENT_BYTES || stored.size !== upload.size || stored.contentType !== upload.contentType) {
    await store.delete(key)
    return { kind: "mismatch", message: "The uploaded file doesn't match what was declared, so it was discarded." }
  }

  const claimed = await col.findOneAndUpdate(
    { userId, missionId, id: uploadId, status: "pending" },
    { $set: { status: "completed" } }
  )
  if (!claimed) return { kind: "already_completed" }

  const document = await attachDocument(userId, missionId, {
    id: uploadId,
    name: upload.name,
    mimeType: upload.contentType,
    storageUrl: `${upload.store}:${key}`,
    extractedText: "",
    summary: "",
    extractedFields: {},
  })
  return document ? { kind: "ok", document } : { kind: "not_found" }
}
