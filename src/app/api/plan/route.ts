import { NextResponse } from "next/server"
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TransitionPlanInput

    if (!body.goal || typeof body.goal !== "string") {
      return NextResponse.json({ success: false, error: "Goal is required" }, { status: 400 })
    }

    const prompt = buildTransitionPlanPrompt(body)
    const response = await generateWithRetry(prompt)

    return NextResponse.json({ success: true, response })
  } catch (error) {
    console.error("Plan API Error:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate plan",
      },
      { status: 500 }
    )
  }
}