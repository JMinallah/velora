import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { agentEnabled } from "@/lib/env"
import { generateGeminiText, isTransientGeminiError } from "@/lib/ai/gemini"
import { buildTransitionPlanPrompt, type TransitionPlanInput } from "@/lib/coordination/plan"

async function generateWithRetry(prompt: string) {
  try {
    return await generateGeminiText(prompt)
  } catch (error) {
    if (isTransientGeminiError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 700))
      return await generateGeminiText(prompt)
    }

    throw error
  }
}

export const POST = withAuth(async (request) => {
  try {
    // Same contract as the chat route: no AI configured is an expected state
    // (manual mode), not a server error — the client offers manual planning.
    if (!agentEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: "AI planning is not available right now. You can still create the mission and plan it yourself.",
          code: "agent_disabled",
        },
        { status: 503 }
      )
    }

    const body = (await request.json()) as TransitionPlanInput

    if (!body.goal || typeof body.goal !== "string") {
      return NextResponse.json({ success: false, error: "Goal is required" }, { status: 400 })
    }

    const prompt = buildTransitionPlanPrompt(body)
    const response = await generateWithRetry(prompt)

    return NextResponse.json({ success: true, response })
  } catch (error) {
    return serverError("Plan API Error:", error)
  }
})