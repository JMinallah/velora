import { getDb } from "@/adapters/db"
import { log, errorFields } from "@/lib/log"
import { COLLECTIONS } from "./collections"

/**
 * Hourly operational counters for the ops page (NFR-OBS-3): API requests,
 * server errors, rate-limited requests, model calls, model failures and
 * model latency. Counts only — no user ids, no content. Kept 8 days.
 */

export type HourBucket = {
  _id: string // "2026-10-14T19" (UTC hour)
  requests?: number
  serverErrors?: number
  rateLimited?: number
  llmCalls?: number
  llmFailures?: number
  llmMsTotal?: number
  expiresAt: Date
}

const KEEP_MS = 8 * 24 * 60 * 60 * 1000

const hourKey = (now: Date) => now.toISOString().slice(0, 13)

/** Adds to the current hour's counters. Never throws and never delays the caller. */
export function countHourly(increments: Partial<Record<Exclude<keyof HourBucket, "_id" | "expiresAt">, number>>, now = new Date()): void {
  void (async () => {
    const db = await getDb()
    await db
      .collection<HourBucket>(COLLECTIONS.opsMetrics)
      .updateOne({ _id: hourKey(now) }, { $inc: increments, $setOnInsert: { expiresAt: new Date(now.getTime() + KEEP_MS) } }, { upsert: true })
  })().catch((err) => log.warn("ops_metrics_write_failed", errorFields(err)))
}

/** The last `hours` hourly buckets, oldest first, with missing hours as zeros. */
export async function recentHours(hours = 24, now = new Date()): Promise<(Omit<HourBucket, "expiresAt"> & { hour: string })[]> {
  const keys = Array.from({ length: hours }, (_, i) => hourKey(new Date(now.getTime() - (hours - 1 - i) * 3_600_000)))
  const db = await getDb()
  const found = await db
    .collection<HourBucket>(COLLECTIONS.opsMetrics)
    .find({ _id: { $in: keys } })
    .toArray()
  const byKey = new Map(found.map((b) => [b._id, b]))
  return keys.map((key) => {
    const b = byKey.get(key)
    return {
      _id: key,
      hour: `${key}:00Z`,
      requests: b?.requests ?? 0,
      serverErrors: b?.serverErrors ?? 0,
      rateLimited: b?.rateLimited ?? 0,
      llmCalls: b?.llmCalls ?? 0,
      llmFailures: b?.llmFailures ?? 0,
      llmMsTotal: b?.llmMsTotal ?? 0,
    }
  })
}
