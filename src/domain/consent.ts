import { z } from "zod"
import { getDb } from "@/adapters/db"
import { LEGAL_VERSION } from "@/lib/legal"
import { COLLECTIONS } from "./collections"

/**
 * What the user has agreed to (docs/08-LEGAL-RISKS.md A3, A4, C1), kept as
 * evidence: the terms/privacy version, when, and that they confirmed being
 * 18+ — plus a separate, revocable consent for AI to read their documents
 * (identity documents go to the AI provider abroad).
 */
export type ConsentRecord = {
  termsVersion?: string
  acceptedAt?: string
  adultConfirmed?: boolean
  documentAi?: { granted: boolean; at: string }
}

export type ConsentStatus = {
  /** Accepted the current terms + privacy policy and confirmed 18+. */
  current: boolean
  documentAi: boolean
  record: ConsentRecord
}

export const consentUpdateSchema = z.union([
  z.object({ acceptTerms: z.literal(LEGAL_VERSION), adult: z.literal(true) }).strict(),
  z.object({ documentAi: z.boolean() }).strict(),
])

type SettingsDoc = { userId: string; consent?: ConsentRecord; updatedAt?: string }

export async function getConsent(userId: string): Promise<ConsentStatus> {
  const db = await getDb()
  const record = (await db.collection<SettingsDoc>(COLLECTIONS.userSettings).findOne({ userId }))?.consent ?? {}
  return {
    current: record.termsVersion === LEGAL_VERSION && record.adultConfirmed === true,
    documentAi: record.documentAi?.granted === true,
    record,
  }
}

export async function updateConsent(userId: string, update: z.infer<typeof consentUpdateSchema>): Promise<ConsentStatus> {
  const db = await getDb()
  const now = new Date().toISOString()
  const set: Record<string, unknown> =
    "acceptTerms" in update
      ? { "consent.termsVersion": update.acceptTerms, "consent.acceptedAt": now, "consent.adultConfirmed": true }
      : { "consent.documentAi": { granted: update.documentAi, at: now } }
  await db.collection<SettingsDoc>(COLLECTIONS.userSettings).updateOne({ userId }, { $set: { ...set, updatedAt: now } }, { upsert: true })
  return getConsent(userId)
}
