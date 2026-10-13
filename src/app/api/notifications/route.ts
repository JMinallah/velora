import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { listNotifications, markRemindersRead } from "@/domain/reminders"
import { readJson, serverError, validationError } from "@/lib/http"

const markReadSchema = z.object({ ids: z.array(z.string()).max(500) })

/** The notification bell: reminders delivered in the app, and how many are unread. */
export const GET = withAuth(async (_req, session) => {
  try {
    return NextResponse.json({ success: true, data: await listNotifications(session.userId) })
  } catch (err) {
    return serverError("GET /api/notifications", err)
  }
})

export const PATCH = withAuth(async (req, session) => {
  try {
    const parsed = markReadSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const modified = await markRemindersRead(session.userId, parsed.data.ids)
    return NextResponse.json({ success: true, data: { modified } })
  } catch (err) {
    return serverError("PATCH /api/notifications", err)
  }
})
