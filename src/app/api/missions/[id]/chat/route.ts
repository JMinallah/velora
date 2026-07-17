import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { runAgentTurn } from "@/agent/loop"
import { GeminiProvider, isTransientLlmError } from "@/agent/providers/gemini"
import type { AgentTurn } from "@/agent/providers/types"
import { getMission } from "@/domain/missions"
import { listMessages, createMessage } from "@/domain/messages"
import { agentEnabled } from "@/lib/env"

const HISTORY_LIMIT = 20

export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const body = await req.json()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message || message.length > 4000) {
      return NextResponse.json(
        { success: false, error: "message is required (max 4000 chars)" },
        { status: 400 }
      )
    }

    const mission = await getMission(session.userId, id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    if (!agentEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: "AI features are not configured. The mission remains fully usable manually.",
          code: "agent_disabled",
        },
        { status: 503 }
      )
    }

    // Rebuild conversation history from stored messages (the DB is the
    // source of truth, not the client).
    const stored = await listMessages(session.userId, id)
    const history: AgentTurn[] = stored.slice(-HISTORY_LIMIT).map((m) =>
      m.type === "user"
        ? { role: "user", text: m.text }
        : { role: "assistant", text: m.text }
    )

    await createMessage(session.userId, { missionId: id, type: "user", text: message, source: "user" })

    let run
    try {
      run = await runAgentTurn({
        provider: new GeminiProvider(),
        userId: session.userId,
        missionId: id,
        userMessage: message,
        history,
      })
    } catch (error) {
      if (isTransientLlmError(error)) {
        return NextResponse.json(
          { success: false, error: "The AI service is briefly overloaded — try again in a moment.", code: "llm_transient" },
          { status: 503 }
        )
      }
      throw error
    }

    await createMessage(session.userId, {
      missionId: id,
      type: "reasoning",
      text: run.reply,
      source: "agent",
    })

    return NextResponse.json({
      success: true,
      data: { reply: run.reply, receipts: run.receipts, promptVersion: run.promptVersion },
    })
  } catch (err) {
    console.error("POST /api/missions/[id]/chat", err)
    return NextResponse.json({ success: false, error: "Chat failed" }, { status: 500 })
  }
})
