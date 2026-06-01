import { NextResponse } from "next/server"
import { createReminder, listReminders, markRemindersRead } from "@/lib/mongodb/reminders"
import type { ReminderRecord } from "@/lib/mongodb/models"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const missionId = url.searchParams.get("missionId") || undefined

    const data = await listReminders(missionId ? { missionId } : undefined)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("GET /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReminderRecord>
    if (!body.missionId || !body.title || !body.dueAt) {
      return NextResponse.json({ success: false, error: "missionId, title and dueAt are required" }, { status: 400 })
    }

    const created = await createReminder(body)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; ids?: string[] }
    if (body.action === "markRead") {
      const ids = body.ids ?? []
      const count = await markRemindersRead(ids)
      return NextResponse.json({ success: true, data: { modified: count } })
    }

    return NextResponse.json({ success: false, error: "unknown action" }, { status: 400 })
  } catch (err) {
    console.error("PATCH /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
