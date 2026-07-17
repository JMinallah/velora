import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { createReminder, listReminders, markRemindersRead } from "@/domain/reminders"
import type { ReminderRecord } from "@/domain/collections"

export const GET = withAuth(async (req, session) => {
  try {
    const url = new URL(req.url)
    const missionId = url.searchParams.get("missionId") || undefined

    const data = await listReminders(session.userId, missionId ? { missionId } : undefined)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("GET /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const POST = withAuth(async (req, session) => {
  try {
    const body = (await req.json()) as Partial<ReminderRecord>
    if (!body.missionId || !body.title || !body.dueAt) {
      return NextResponse.json({ success: false, error: "missionId, title and dueAt are required" }, { status: 400 })
    }

    const created = await createReminder(session.userId, {
      ...body,
      missionId: body.missionId,
      title: body.title,
      dueAt: body.dueAt,
    })
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const PATCH = withAuth(async (req, session) => {
  try {
    const body = (await req.json()) as { action?: string; ids?: string[] }
    if (body.action === "markRead") {
      const count = await markRemindersRead(session.userId, body.ids ?? [])
      return NextResponse.json({ success: true, data: { modified: count } })
    }

    return NextResponse.json({ success: false, error: "unknown action" }, { status: 400 })
  } catch (err) {
    console.error("PATCH /api/reminders error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
