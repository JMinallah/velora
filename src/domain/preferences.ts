import { z } from "zod"
import { ObjectId } from "mongodb"
import { getDb } from "@/adapters/db"
import { isValidTimeZone } from "@/lib/dates"
import type { NotificationPreferences } from "@/types"
import { COLLECTIONS } from "./collections"

/**
 * Per-user notification preferences (FR-REM-1). Reminders are the product's
 * point, so both channels start on; one switch turns either off.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: true,
  email: true,
  taskReminders: true,
  leadDays: 1,
  timeZone: "UTC",
}

export const notificationPreferencesPatchSchema = z
  .object({
    inApp: z.boolean(),
    email: z.boolean(),
    taskReminders: z.boolean(),
    leadDays: z.number().int().min(0).max(14),
    timeZone: z.string().max(64).refine(isValidTimeZone, "unknown time zone"),
  })
  .partial()
  .strict()

type UserSettingsRecord = {
  userId: string
  notifications: Partial<NotificationPreferences>
  updatedAt: string
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const db = await getDb()
  const doc = await db.collection<UserSettingsRecord>(COLLECTIONS.userSettings).findOne({ userId })
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...doc?.notifications }
}

export async function updateNotificationPreferences(
  userId: string,
  patch: z.infer<typeof notificationPreferencesPatchSchema>
): Promise<NotificationPreferences> {
  const db = await getDb()
  const set = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`notifications.${key}`, value]))
  await db
    .collection<UserSettingsRecord>(COLLECTIONS.userSettings)
    .updateOne({ userId }, { $set: { ...set, updatedAt: new Date().toISOString() } }, { upsert: true })
  return getNotificationPreferences(userId)
}

/**
 * The address reminders go to: the account's own email from Auth.js's users
 * collection — never an address from a request. Null when there is none.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId) || userId.length !== 24) return null
  const db = await getDb()
  const user = await db
    .collection<{ _id: ObjectId; email?: string | null }>(COLLECTIONS.users)
    .findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } })
  return user?.email || null
}
