import { MongoServerError } from "mongodb"
import { getDb } from "@/adapters/db"
import { env } from "@/lib/env"
import { localTimeToUtc } from "@/lib/dates"
import { COLLECTIONS } from "./collections"

/**
 * The app-wide daily budget of model calls (NFR-PERF-4, delivery plan 7-2).
 *
 * The free tier's quota is per project (Gemini 3.5 Flash-Lite: 500 requests
 * a day, reset at midnight Pacific), shared by every user. Rather than find
 * out mid-conversation, the app counts its own calls and stops at a cap a
 * little below the provider's, so AI features pause cleanly — with an
 * honest banner — while everything manual keeps working. If the provider
 * reports its daily quota spent anyway (another app on the same key, or
 * the cap set too high), the budget is marked spent for the rest of the day.
 */

export const QUOTA_TIME_ZONE = "America/Los_Angeles"

/** Thrown before calling the model once today's budget is used up; routes treat it like the provider's own daily-quota error. */
export class LlmBudgetExhaustedError extends Error {
  readonly dailyQuota = true
  constructor() {
    super("Velora's daily AI budget is used up")
    this.name = "LlmBudgetExhaustedError"
  }
}

type UsageRecord = { _id: string; calls: number; providerExhausted?: boolean; expiresAt: Date }

/** The provider's quota day (its calendar date in Pacific time). */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** When the current quota day ends. */
export function quotaResetsAt(now = new Date()): Date {
  const today = quotaDay(now)
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return localTimeToUtc(tomorrow, 0, QUOTA_TIME_ZONE)!
}

const usage = async () => (await getDb()).collection<UsageRecord>(COLLECTIONS.llmUsage)

/**
 * Counts one model call against today's budget, or throws
 * LlmBudgetExhaustedError. Atomic: concurrent callers can't overshoot the cap.
 */
export async function reserveModelCall(now = new Date()): Promise<void> {
  const day = quotaDay(now)
  try {
    await (await usage()).findOneAndUpdate(
      { _id: day, calls: { $lt: env().LLM_DAILY_CAP }, providerExhausted: { $ne: true } },
      { $inc: { calls: 1 }, $setOnInsert: { expiresAt: new Date(quotaResetsAt(now).getTime() + 24 * 60 * 60 * 1000) } },
      { upsert: true }
    )
  } catch (err) {
    // Today's record exists but didn't match: the cap is reached or the provider said stop.
    if (err instanceof MongoServerError && err.code === 11000) throw new LlmBudgetExhaustedError()
    throw err
  }
}

/** The provider reported its daily quota spent: stop calling it until the reset. */
export async function markProviderQuotaSpent(now = new Date()): Promise<void> {
  await (await usage()).updateOne(
    { _id: quotaDay(now) },
    { $set: { providerExhausted: true }, $setOnInsert: { calls: 0, expiresAt: new Date(quotaResetsAt(now).getTime() + 24 * 60 * 60 * 1000) } },
    { upsert: true }
  )
}

export type AiBudget = { calls: number; cap: number; exhausted: boolean; resetsAt: string }

export async function getAiBudget(now = new Date()): Promise<AiBudget> {
  const record = await (await usage()).findOne({ _id: quotaDay(now) })
  const cap = env().LLM_DAILY_CAP
  const calls = record?.calls ?? 0
  return { calls, cap, exhausted: Boolean(record?.providerExhausted) || calls >= cap, resetsAt: quotaResetsAt(now).toISOString() }
}
