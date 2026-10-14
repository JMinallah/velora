import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { aiPausedResponse, llmUnavailable, readJson, serverError, validationError } from "@/lib/http"
import { env } from "@/lib/env"
import { getLlmProvider } from "@/agent/providers"
import { isDailyQuotaError, isTransientLlmError } from "@/agent/providers/gemini"
import { generatePlan, PlanGenerationError } from "@/agent/planner"
import { createProposal } from "@/domain/proposals"
import { log } from "@/lib/log"

const planRequestSchema = z.object({
  goal: z.string().trim().min(1).max(1000),
  deadline: z.string().trim().max(200).optional(),
  concerns: z.string().trim().max(2000).optional(),
})

/**
 * POST: draft a mission plan from the user's description (FR-MSN-1). The
 * result is stored as a *proposal* for review — no mission is created until
 * the user accepts it (FR-MSN-2).
 */
export const POST = withAuth(
  async (req, session) => {
    try {
      const parsed = planRequestSchema.safeParse(await readJson(req))
      if (!parsed.success) return validationError(parsed.error)

      const provider = getLlmProvider()
      if (!provider) {
        return NextResponse.json(
          {
            success: false,
            error: "AI planning is not available right now. You can still create the mission and plan it yourself.",
            code: "agent_disabled",
          },
          { status: 503 }
        )
      }
      const paused = await aiPausedResponse()
      if (paused) return paused

      let generated
      try {
        generated = await generatePlan({ provider, ...parsed.data, today: new Date().toISOString().slice(0, 10) })
      } catch (error) {
        if (error instanceof PlanGenerationError) {
          log.warn("plan_invalid", { issues: error.issues.slice(0, 10) })
          return NextResponse.json(
            {
              success: false,
              error: "Velora couldn't put together a valid plan this time. Try again, or plan it yourself.",
              code: "plan_invalid",
            },
            { status: 422 }
          )
        }
        const unavailable = llmUnavailable(error, {
          isDailyQuota: isDailyQuotaError(error),
          isTransient: isTransientLlmError(error),
        })
        if (unavailable) return unavailable
        throw error
      }

      const proposal = await createProposal(session.userId, {
        plan: generated.plan,
        request: parsed.data,
        promptVersion: generated.promptVersion,
        model: env().GEMINI_MODEL,
        attempts: generated.attempts,
      })
      return NextResponse.json({ success: true, data: proposal }, { status: 201 })
    } catch (err) {
      return serverError("POST /api/plans", err)
    }
  },
  { rateLimit: "llm" }
)
