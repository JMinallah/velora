import { NextResponse } from "next/server"
import { getMailer } from "@/adapters/email"
import { dispatchDueReminders } from "@/domain/dispatch"
import { rejectUnlessCron } from "@/lib/cron-auth"
import { env } from "@/lib/env"
import { errorFields, log } from "@/lib/log"

// Called by the GitHub Actions schedule (.github/workflows/reminders.yml)
// and, where the host allows, its own cron; double calls are harmless
// (src/domain/dispatch.ts).
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request)
  if (rejected) return rejected

  try {
    const summary = await dispatchDueReminders({ mailer: getMailer(), appUrl: env().APP_URL })
    log.info("reminder_dispatch", summary)
    return NextResponse.json({ success: true, data: summary })
  } catch (error) {
    log.error("reminder_dispatch_failed", errorFields(error))
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
