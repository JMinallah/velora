import { NextResponse } from "next/server"
import { verifyGrant } from "@/adapters/storage/signed"
import { localPath, writeLocalObject } from "@/adapters/storage/local"
import { MAX_DOCUMENT_BYTES } from "@/adapters/storage"
import fs from "node:fs"

/**
 * The local store's equivalent of R2 presigned URLs. Deliberately NOT behind
 * withAuth (docs/04-SECURITY.md public-route list): the HMAC-signed, expiring
 * token *is* the authorization, exactly as with a presigned URL — it names
 * one object and one operation, and only the server can mint it.
 */
const refuse = (status: number, error: string) => NextResponse.json({ success: false, error }, { status })

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const check = verifyGrant((await params).token)
  if (!check.ok) return refuse(check.reason === "expired" ? 410 : 403, check.reason === "expired" ? "This link has expired." : "Invalid link.")
  const { grant } = check
  if (grant.op !== "get") return refuse(403, "Invalid link.")
  try {
    const bytes = await fs.promises.readFile(localPath(grant.key))
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": grant.contentType,
        "Content-Disposition": `inline; filename="${grant.filename.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return refuse(404, "not found")
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const check = verifyGrant((await params).token)
  if (!check.ok) return refuse(check.reason === "expired" ? 410 : 403, check.reason === "expired" ? "This upload link has expired." : "Invalid link.")
  const { grant } = check
  if (grant.op !== "put") return refuse(403, "Invalid link.")
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== grant.contentType) {
    return refuse(400, "Content type does not match this upload.")
  }
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (declared > Math.min(grant.maxBytes, MAX_DOCUMENT_BYTES)) return refuse(413, "File too large.")
  const bytes = Buffer.from(await req.arrayBuffer())
  if (bytes.length > Math.min(grant.maxBytes, MAX_DOCUMENT_BYTES)) return refuse(413, "File too large.")
  await writeLocalObject(grant.key, bytes, grant.contentType)
  return new Response(null, { status: 200 })
}
