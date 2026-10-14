import { getDb } from "@/adapters/db"
import { agentEnabled, env } from "@/lib/env"
import { COLLECTIONS } from "./collections"
import { getAiBudget } from "./llm-budget"
import { recentHours } from "./ops-metrics"

/** A reminder this late means the scheduler isn't calling the dispatcher (it runs every 15 min). */
const LATE_AFTER_MS = 30 * 60 * 1000

/**
 * The ops page's numbers (NFR-OBS-3): AI budget, API error rate, model
 * health and reminder dispatch status. Aggregates only — no user ids, no content.
 */
export async function opsSnapshot(now = new Date()) {
  const db = await getDb()
  const hours = await recentHours(24, now)
  const sum = (key: "requests" | "serverErrors" | "rateLimited" | "llmCalls" | "llmFailures" | "llmMsTotal") =>
    hours.reduce((n, h) => n + (h[key] ?? 0), 0)
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const lateBefore = new Date(now.getTime() - LATE_AFTER_MS).toISOString()

  const reminders = db.collection(COLLECTIONS.reminders)
  const [budget, byStatus, late, lastDispatch, outcomes] = await Promise.all([
    getAiBudget(now),
    reminders.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    reminders.countDocuments({
      status: "scheduled",
      dueAt: { $lte: lateBefore },
      $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: lateBefore } }],
    }),
    db.collection<{ at: string }>(COLLECTIONS.reminderDispatches).find({}, { projection: { at: 1 } }).sort({ at: -1 }).limit(1).next(),
    db
      .collection(COLLECTIONS.reminderDispatches)
      .aggregate<{ _id: string; n: number }>([{ $match: { at: { $gte: dayAgo } } }, { $group: { _id: "$outcome", n: { $sum: 1 } } }])
      .toArray(),
  ])

  const requests = sum("requests")
  const llmCalls = sum("llmCalls")
  return {
    generatedAt: now.toISOString(),
    ai: { enabled: agentEnabled(), model: env().GEMINI_MODEL, ...budget },
    last24h: {
      requests,
      serverErrors: sum("serverErrors"),
      errorRate: requests ? sum("serverErrors") / requests : 0,
      rateLimited: sum("rateLimited"),
      llmCalls,
      llmFailures: sum("llmFailures"),
      llmAvgMs: llmCalls ? Math.round(sum("llmMsTotal") / llmCalls) : null,
      dispatchOutcomes: Object.fromEntries(outcomes.map((o) => [o._id, o.n])),
    },
    reminders: {
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id ?? "unknown", s.n])),
      late,
      lastDispatchAt: lastDispatch?.at ?? null,
    },
    hours: hours.map(({ hour, requests, serverErrors, rateLimited, llmCalls, llmFailures }) => ({
      hour,
      requests,
      serverErrors,
      rateLimited,
      llmCalls,
      llmFailures,
    })),
  }
}

export type OpsSnapshot = Awaited<ReturnType<typeof opsSnapshot>>
