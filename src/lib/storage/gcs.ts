import { Storage } from "@google-cloud/storage"
import path from "path"
import fs from "fs"

const GCS_BUCKET = process.env.GCS_BUCKET || ""

export async function uploadBufferToStorage(buffer: Buffer, filename: string, contentType = "application/octet-stream") {
  if (GCS_BUCKET) {
    const storage = new Storage()
    const bucket = storage.bucket(GCS_BUCKET)
    const file = bucket.file(filename)
    await file.save(buffer, { contentType })
    await file.makePublic().catch(() => {})
    return `https://storage.googleapis.com/${GCS_BUCKET}/${filename}`
  }

  // fallback to local public/uploads
  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  await fs.promises.mkdir(uploadsDir, { recursive: true })
  const filePath = path.join(uploadsDir, filename)
  await fs.promises.writeFile(filePath, buffer)
  return `/uploads/${filename}`
}
