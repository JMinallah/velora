import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { env } from "@/lib/env"

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Machine-to-machine endpoints (docs/04-SECURITY.md T7) are authenticated by
 * the CRON_SECRET bearer token, compared in constant time — not a user
 * session. Returns the error response to send, or null when authorized.
 * There is no unauthenticated mode: without the secret configured, they
 * refuse to run.
 */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = env().CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 503 })
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return new Response("Unauthorized", { status: 401 })
  }
  return null
}
