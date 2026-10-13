import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"

/**
 * HMAC-signed, expiring tokens for the local store's file URLs — the local
 * equivalent of S3/R2 presigned URLs. The token carries the object key and
 * exactly what it allows; anyone holding it may do only that, until `exp`.
 */
export type FileGrant =
  | { op: "put"; key: string; contentType: string; maxBytes: number; exp: number }
  | { op: "get"; key: string; contentType: string; filename: string; exp: number }

function signingKey(): Buffer {
  // Derived, so the auth secret itself never signs file URLs.
  return createHmac("sha256", env().AUTH_SECRET).update("velora/file-urls/v1").digest()
}

const b64 = (data: string | Buffer) => Buffer.from(data).toString("base64url")

export function signGrant(grant: FileGrant): string {
  const payload = b64(JSON.stringify(grant))
  const sig = b64(createHmac("sha256", signingKey()).update(payload).digest())
  return `${payload}.${sig}`
}

export type GrantCheck = { ok: true; grant: FileGrant } | { ok: false; reason: "malformed" | "bad_signature" | "expired" }

export function verifyGrant(token: string, nowSeconds = Math.floor(Date.now() / 1000)): GrantCheck {
  const [payload, sig, extra] = token.split(".")
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: "malformed" }
  const expected = createHmac("sha256", signingKey()).update(payload).digest()
  const given = Buffer.from(sig, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" }
  let grant: FileGrant
  try {
    grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (typeof grant.exp !== "number" || grant.exp <= nowSeconds) return { ok: false, reason: "expired" }
  return { ok: true, grant }
}
