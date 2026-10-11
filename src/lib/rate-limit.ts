import { NextResponse } from "next/server"
import { consume, type RateRule } from "@/adapters/ratelimit"

/**
 * Rate-limit policy (NFR-SEC-3, 04-SECURITY §5). Every authenticated route
 * gets a tier through withAuth: GETs are "read", everything else "mutation"
 * unless the route asks for "llm" — the tier that protects the shared,
 * free-tier model quota. That quota is per project, not per user: Gemini 3.5
 * Flash-Lite allows 15 requests/min and 500/day (AI Studio, 2026-10-11), and
 * one chat message costs 2–3 model requests.
 */
export type RateTier = "read" | "mutation" | "llm"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const POLICY: Record<RateTier, { perUser: RateRule[]; perIp: RateRule[] }> = {
  read: {
    perUser: [{ name: "read-user-min", limit: 300, windowMs: MINUTE }],
    perIp: [],
  },
  mutation: {
    perUser: [{ name: "mutation-user-min", limit: 60, windowMs: MINUTE }],
    perIp: [],
  },
  llm: {
    perUser: [
      { name: "llm-user-min", limit: 6, windowMs: MINUTE },
      // ~50 messages ≈ 125 model requests: one heavy user can't take most of the 500/day.
      { name: "llm-user-day", limit: 50, windowMs: DAY },
    ],
    // Several accounts behind one address (or one abuser with many) share this.
    perIp: [{ name: "llm-ip-min", limit: 20, windowMs: MINUTE }],
  },
}

/** First hop of X-Forwarded-For (set by the hosting proxy), else "unknown". */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

/**
 * Returns a 429 response when any rule for the tier is exhausted, else null.
 * Fails open: if the limiter itself errors (e.g. the database is briefly
 * unreachable), the request proceeds — the handler needs the same database
 * and will report the outage itself.
 */
export async function enforceRateLimit(
  tier: RateTier,
  subjects: { userId: string; ip: string }
): Promise<Response | null> {
  const { perUser, perIp } = POLICY[tier]
  let decisions
  try {
    decisions = await Promise.all([
      ...perUser.map((rule) => consume(rule, subjects.userId)),
      ...perIp.map((rule) => consume(rule, subjects.ip)),
    ])
  } catch (error) {
    console.error("rate limiter unavailable; allowing request", error)
    return null
  }

  const denied = decisions.filter((d) => !d.allowed)
  if (denied.length === 0) return null

  const retryAfter = Math.max(...denied.map((d) => d.retryAfterSeconds))
  const wait = retryAfter < 120 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`
  return NextResponse.json(
    { success: false, error: `Too many requests — please try again in ${wait}.`, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  )
}
