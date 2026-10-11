import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Storage } from "@google-cloud/storage"
import { env } from "@/lib/env"

/**
 * Interim private document storage until R2 + signed URLs (docs/06-DELIVERY-PLAN.md
 * 5-1, which deletes this module).
 *
 * - Object keys are generated here (`<userId>/<uuid><ext>`): the uploader's
 *   filename never reaches a filesystem or bucket path (it previously did,
 *   allowing `../` path traversal).
 * - Nothing is public: no `makePublic()`, and the development fallback
 *   writes outside `public/`, so files are never served by the web server.
 * - Production without a bucket refuses uploads rather than writing to an
 *   ephemeral or shared disk.
 */

const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "text/plain": ".txt",
}

export const ALLOWED_DOCUMENT_TYPES = new Set(Object.keys(EXTENSIONS))

export class StorageUnavailableError extends Error {}

/** Development-only local store; outside public/ and gitignored. */
export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), ".data", "uploads")

export async function storeDocument(userId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const extension = EXTENSIONS[mimeType]
  if (!extension) throw new Error(`unsupported document type: ${mimeType}`)
  const key = `${userId}/${randomUUID()}${extension}`

  const bucket = env().GCS_BUCKET
  if (bucket) {
    await new Storage().bucket(bucket).file(key).save(buffer, { contentType: mimeType, resumable: false })
    return `gs://${bucket}/${key}`
  }

  if (process.env.NODE_ENV === "production") {
    throw new StorageUnavailableError("Document storage is not configured")
  }

  const filePath = path.resolve(LOCAL_UPLOAD_DIR, key)
  if (!filePath.startsWith(LOCAL_UPLOAD_DIR + path.sep)) throw new Error("invalid storage key")
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, buffer)
  return `local://${key}`
}
