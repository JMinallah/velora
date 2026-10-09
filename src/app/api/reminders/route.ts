import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { createReminder, listReminders, markRemindersRead } from "@/domain/reminders"
import { reminderCreateSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"

const markReadSchema = z.object({
  action: z.literal("markRead"),
  ids: z.array(z.string()).max(500).default([]),
})

export const GET = withAuth(async (req, session) => {
  try {
    const url = new URL(req.url)
    const missionId = url.searchParams.get("missionId") || undefined

    const data = await listReminders(session.userId, missionId ? { missionId } : undefined)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return serverError("GET /api/reminders", err)
  }
})

export const POST = withAuth(async (req, session) => {
  try {
    // Only the listed fields are accepted; status, read and id are server-owned.
    const parsed = reminderCreateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)

    const created = await createReminder(session.userId, parsed.data)
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return serverError("POST /api/reminders", err)
  }
})

export const PATCH = withAuth(async (req, session) => {
  try {
    const parsed = markReadSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)

    const count = await markRemindersRead(session.userId, parsed.data.ids)
    return NextResponse.json({ success: true, data: { modified: count } })
  } catch (err) {
    return serverError("PATCH /api/reminders", err)
  }
})
