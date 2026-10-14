import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { agentEnabled } from "@/lib/env"
import { getAiBudget } from "@/domain/llm-budget"
import { peek } from "@/adapters/ratelimit"
import { LLM_USER_DAILY } from "@/lib/rate-limit"
import { serverError } from "@/lib/http"

/**
 * Whether AI features are available right now, and the caller's share used
 * today (NFR-PERF-4): drives the "AI paused" banner and the usage meter.
 * The app-wide call count isn't exposed — only whether it's spent.
 */
export const GET = withAuth(async (_req, session) => {
  try {
    const mine = await peek(LLM_USER_DAILY, session.userId)
    const usage = { used: mine.used, limit: LLM_USER_DAILY.limit, resetsAt: mine.resetsAt }
    if (!agentEnabled()) {
      return NextResponse.json({ success: true, data: { available: false, reason: "disabled", usage } })
    }
    const budget = await getAiBudget()
    return NextResponse.json({
      success: true,
      data: budget.exhausted
        ? { available: false, reason: "daily-limit", resumesAt: budget.resetsAt, usage }
        : { available: true, reason: null, usage },
    })
  } catch (err) {
    return serverError("GET /api/ai/status", err)
  }
})
