import { NextResponse } from "next/server"
import { getDb } from "@/adapters/db"
import { COLLECTIONS, type ReminderRecord } from "@/domain/collections"
import { emitEvent } from "@/domain/events"
import { env } from "@/lib/env"

// Machine-to-machine endpoint: authenticated by CRON_SECRET bearer token,
// not a user session (docs/04-SECURITY.md T7). Refuses to run if the secret
// is not configured — there is no unauthenticated mode.
export async function GET(request: Request) {
  const secret = env().CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET is not configured" },
      { status: 503 }
    )
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Atomically claim one due reminder at a time so concurrent or duplicate
    // cron fires never double-process (FR-REM-2 idempotency).
    let processed = 0
    for (;;) {
      const reminder = await db.collection<ReminderRecord>(COLLECTIONS.reminders).findOneAndUpdate(
        { status: "scheduled", dueAt: { $lte: now } },
        { $set: { status: "sent", updatedAt: now } },
        { returnDocument: "after" }
      )
      if (!reminder) break

      await emitEvent(reminder.userId, {
        missionId: reminder.missionId,
        type: "reminder-created",
        actor: "system",
        payload: {
          reminderId: reminder.id,
          title: reminder.title,
          details: reminder.details,
        },
      }).catch(() => undefined)

      processed++
    }

    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error("Cron error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
