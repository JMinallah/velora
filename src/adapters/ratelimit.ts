import { MongoServerError } from "mongodb"
import { getDb } from "@/adapters/db"
import { COLLECTIONS } from "@/domain/collections"

/**
 * Fixed-window rate limiter backed by MongoDB (docs/06-DELIVERY-PLAN.md 2.5-8).
 *
 * Counters live in the shared database, so limits hold across serverless
 * instances without another service (an Upstash/Redis implementation can
 * replace this module behind the same `consume` signature if traffic ever
 * needs it). One atomic upsert per rule per request; a TTL index drops
 * counters when their window ends.
 */
export type RateRule = {
  /** Stable id; part of the counter key. */
  name: string
  limit: number
  windowMs: number
}

export type RateDecision = {
  allowed: boolean
  remaining: number
  /** Seconds until this rule's window resets. */
  retryAfterSeconds: number
}

type Counter = { _id: string; count: number; expiresAt: Date }

export async function consume(rule: RateRule, subject: string, now = Date.now()): Promise<RateDecision> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs
  const windowEnd = windowStart + rule.windowMs
  const key = `${rule.name}:${subject}:${windowStart}`
  const counters = (await getDb()).collection<Counter>(COLLECTIONS.rateLimits)

  const increment = () =>
    counters.findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
      { upsert: true, returnDocument: "after" }
    )

  let counter: Counter | null
  try {
    counter = await increment()
  } catch (error) {
    // Two first requests in the same window can race on the upsert; the
    // loser retries as a plain increment of the document the winner created.
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error
    counter = await increment()
  }

  const count = counter?.count ?? 1
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  }
}
