import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/lib/env"
import { assertSafePrefix, UPLOAD_URL_TTL_SECONDS, VIEW_URL_TTL_SECONDS, type DocumentStore } from "./types"

/**
 * Cloudflare R2 through its S3-compatible API. The bucket stays private;
 * uploads and views use presigned URLs. Upload size can't be bound into a
 * presigned PUT, so the upload-complete step checks it with head() and
 * deletes oversized objects.
 */
let client: S3Client | null = null
function r2(): { s3: S3Client; bucket: string } {
  const e = env()
  if (!e.R2_ACCOUNT_ID || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET) {
    throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)")
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  })
  return { s3: client, bucket: e.R2_BUCKET }
}

const expiresAt = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

export const r2Store: DocumentStore = {
  kind: "r2",
  async createUploadUrl(key, { contentType }) {
    const { s3, bucket } = r2()
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    })
    return { url, headers: { "Content-Type": contentType }, expiresAt: expiresAt(UPLOAD_URL_TTL_SECONDS) }
  },
  async head(key) {
    const { s3, bucket } = r2()
    try {
      const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" }
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null
      throw error
    }
  },
  async createViewUrl(key, { filename, contentType }) {
    const { s3, bucket } = r2()
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `inline; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
      }),
      { expiresIn: VIEW_URL_TTL_SECONDS }
    )
    return { url, expiresAt: expiresAt(VIEW_URL_TTL_SECONDS) }
  },
  async read(key) {
    const { s3, bucket } = r2()
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return Buffer.from(await res.Body!.transformToByteArray())
  },
  async delete(key) {
    const { s3, bucket } = r2()
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  },
  async deletePrefix(prefix) {
    assertSafePrefix(prefix)
    const { s3, bucket } = r2()
    // Listing pages hold up to 1,000 keys, the batch-delete limit.
    let token: string | undefined
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/`, ContinuationToken: token }))
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
      if (keys.length) {
        const res = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }))
        if (res.Errors?.length) throw new Error(`R2 refused to delete ${res.Errors.length} object(s)`)
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  },
}
