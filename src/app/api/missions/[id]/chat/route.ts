import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { runAgentTurn } from "@/agent/loop"
import { GeminiProvider, isTransientLlmError } from "@/agent/providers/gemini"
import type { AgentTurn } from "@/agent/providers/types"
import { getMission } from "@/domain/missions"
import { listMessages, createMessage } from "@/domain/messages"
import type { MessageRecord } from "@/domain/collections"
import { readJson, serverError } from "@/lib/http"
import { agentEnabled } from "@/lib/env"

const HISTORY_LIMIT = 20

/**
 * Rebuilds model history from stored messages. Clients can only store type
 * "user" messages (see the messages route), so every other type was written
 * server-side and is an assistant turn. Receipts are included so the model
 * knows what it already did. Consecutive same-role messages are merged so
 * the history always alternates user/assistant.
 */
function toHistory(stored: MessageRecord[]): AgentTurn[] {
  const turns: { role: "user" | "assistant"; text: string }[] = []
  for (const m of stored.slice(-HISTORY_LIMIT)) {
    const role = m.type === "user" ? "user" : "assistant"
    const last = turns[turns.length - 1]
    if (last?.role === role) last.text += `\n${m.text}`
    else turns.push({ role, text: m.text })
  }
  // A window that opens mid-exchange starts with the assistant; drop it.
  while (turns[0]?.role === "assistant") turns.shift()
  return turns
}

export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const body = (await readJson(req)) as { message?: unknown } | null
    const message = typeof body?.message === "string" ? body.message.trim() : ""
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
    const history = toHistory(await listMessages(session.userId, id))
    const sentAt = new Date().toISOString()

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

    // Persist the exchange only once the turn completes, so a failed model
    // call never leaves an unanswered user message in the history. Receipts
    // are stored as their own messages, matching how the chat UI renders them
    // live, so they survive a reload. Explicit timestamps keep the order stable.
    const doneAt = Date.now()
    await createMessage(session.userId, { missionId: id, type: "user", text: message, source: "user", createdAt: sentAt })
    for (const [i, receipt] of run.receipts.entries()) {
      await createMessage(session.userId, {
        missionId: id,
        type: "update",
        text: `✓ ${receipt.text}`,
        source: "agent",
        tool: receipt.tool,
        createdAt: new Date(doneAt + i).toISOString(),
      })
    }
    await createMessage(session.userId, {
      missionId: id,
      type: "reasoning",
      text: run.reply,
      source: "agent",
      promptVersion: run.promptVersion,
      createdAt: new Date(doneAt + run.receipts.length).toISOString(),
    })

    return NextResponse.json({
      success: true,
      data: { reply: run.reply, receipts: run.receipts, promptVersion: run.promptVersion },
    })
  } catch (err) {
    return serverError("POST /api/missions/[id]/chat", err)
  }
})
