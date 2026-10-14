import { NextResponse } from "next/server"
import { pruneExpiredRecords } from "@/domain/retention"
import { rejectUnlessCron } from "@/lib/cron-auth"
import { env } from "@/lib/env"
import { errorFields, log } from "@/lib/log"

// Daily housekeeping, called by the scheduled workflow: retention pruning
// (04-SECURITY §6). Idempotent, so a repeated call is harmless.
export async function GET(request: Request) {
  const rejected = rejectUnlessCron(request)
  if (rejected) return rejected

  try {
    const pruned = await pruneExpiredRecords({ retentionDays: env().EVENT_RETENTION_DAYS })
    log.info("maintenance", { pruned })
    return NextResponse.json({ success: true, data: { pruned } })
  } catch (error) {
    log.error("maintenance_error", errorFields(error))
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
