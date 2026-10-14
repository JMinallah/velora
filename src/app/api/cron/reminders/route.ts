import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { getMailer } from "@/adapters/email"
import { dispatchDueReminders } from "@/domain/dispatch"
import { env } from "@/lib/env"

function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// Machine-to-machine endpoint: authenticated by CRON_SECRET bearer token,
// not a user session (docs/04-SECURITY.md T7). Refuses to run if the secret
// is not configured — there is no unauthenticated mode. Called by the
// GitHub Actions schedule (.github/workflows/reminders.yml) and, where the
// host allows, its own cron; double calls are harmless (src/domain/dispatch.ts).
export async function GET(request: Request) {
  const secret = env().CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET is not configured" },
      { status: 503 }
    )
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const summary = await dispatchDueReminders({ mailer: getMailer(), appUrl: env().APP_URL })
    console.info("reminder dispatch", summary)
    return NextResponse.json({ success: true, data: summary })
  } catch (error) {
    console.error("Cron error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
