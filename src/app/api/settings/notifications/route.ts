import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import {
  getNotificationPreferences,
  notificationPreferencesPatchSchema,
  updateNotificationPreferences,
} from "@/domain/preferences"
import { syncAllTaskReminders } from "@/domain/task-reminders"
import { readJson, serverError, validationError } from "@/lib/http"

export const GET = withAuth(async (_req, session) => {
  try {
    const data = await getNotificationPreferences(session.userId)
    return NextResponse.json({ success: true, data: { ...data, emailAddress: session.email } })
  } catch (err) {
    return serverError("GET /api/settings/notifications", err)
  }
})

export const PATCH = withAuth(async (req, session) => {
  try {
    const parsed = notificationPreferencesPatchSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const data = await updateNotificationPreferences(session.userId, parsed.data)
    // These move or switch task reminders; channels are read at send time.
    const { taskReminders, leadDays, timeZone } = parsed.data
    if (taskReminders !== undefined || leadDays !== undefined || timeZone !== undefined) {
      await syncAllTaskReminders(session.userId)
    }
    return NextResponse.json({ success: true, data: { ...data, emailAddress: session.email } })
  } catch (err) {
    return serverError("PATCH /api/settings/notifications", err)
  }
})
