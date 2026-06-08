import { NextResponse } from "next/server"
import { getDb } from "@/lib/mongodb/client"
import { COLLECTIONS } from "@/lib/mongodb/models"
import { createEvent } from "@/lib/mongodb/events"

export async function GET(request: Request) {
  // In a real app, you'd verify a secret header from Cloud Scheduler
  // const authHeader = request.headers.get('Authorization')
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })

  try {
    const db = await getDb()
    const now = new Date().toISOString()

    // Find scheduled reminders that are due
    const dueReminders = await db.collection(COLLECTIONS.reminders)
      .find({
        status: "scheduled",
        dueAt: { $lte: now }
      })
      .toArray()

    if (dueReminders.length === 0) {
      return NextResponse.json({ success: true, processed: 0 })
    }

    let processed = 0
    for (const reminder of dueReminders) {
      // Update status to 'sent'
      await db.collection(COLLECTIONS.reminders).updateOne(
        { _id: reminder._id },
        { $set: { status: "sent", updatedAt: now } }
      )

      // Create an event so it shows up in the activity feed
      await createEvent({
        missionId: reminder.missionId,
        type: "reminder-created", // Or maybe a new type 'reminder-sent'
        actor: "system",
        payload: {
          reminderId: reminder.id,
          title: reminder.title,
          details: reminder.details
        }
      }).catch(() => undefined)

      processed++
    }

    return NextResponse.json({ success: true, processed })
  } catch (error) {
    console.error("Cron error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
