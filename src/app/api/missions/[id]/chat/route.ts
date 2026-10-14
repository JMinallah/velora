import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { runAgentTurn, type AgentRunResult } from "@/agent/loop"
import { getLlmProvider } from "@/agent/providers"
import { isDailyQuotaError, isTransientLlmError } from "@/agent/providers/gemini"
import type { AgentTurn } from "@/agent/providers/types"
import { getMission } from "@/domain/missions"
import { listMessages, createMessage } from "@/domain/messages"
import type { MessageRecord } from "@/domain/collections"
import { aiPausedResponse, describeLlmFailure, llmUnavailable, readJson, serverError } from "@/lib/http"

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
    // The model sees what it proposed and how the user decided — never the nonce.
    const text =
      m.type === "confirmation" && m.action
        ? `[Proposed, needs the user's confirmation: ${m.action.summary} — status: ${m.action.status}]`
        : m.type === "replan"
          ? `[Proposed a re-plan for the user to review: ${m.text}]`
          : m.text
    const last = turns[turns.length - 1]
    if (last?.role === role) last.text += `\n${text}`
    else turns.push({ role, text })
  }
  // A window that opens mid-exchange starts with the assistant; drop it.
  while (turns[0]?.role === "assistant") turns.shift()
  return turns
}

/**
 * Persists a completed turn. Only called once the turn completes, so a failed
 * model call never leaves an unanswered user message in the history. Receipts
 * are stored as their own messages, matching how the chat UI renders them, so
 * they survive a reload. Explicit timestamps keep the order stable; every
 * message carries the turn id (FR-TRS-2).
 */
async function persistTurn(userId: string, missionId: string, message: string, sentAt: string, run: AgentRunResult) {
  const doneAt = Date.now()
  await createMessage(userId, {
    missionId,
    type: "user",
    text: message,
    source: "user",
    createdAt: sentAt,
    turnId: run.turnId,
  })
  for (const [i, receipt] of run.receipts.entries()) {
    await createMessage(userId, {
      missionId,
      type: "update",
      text: `✓ ${receipt.text}`,
      source: "agent",
      tool: receipt.tool,
      createdAt: new Date(doneAt + i).toISOString(),
      turnId: run.turnId,
    })
  }
  // Confirmation cards are stored so they survive a reload; their status is
  // updated when the user decides (pending-actions route).
  for (const [i, action] of run.proposals.entries()) {
    await createMessage(userId, {
      missionId,
      type: "confirmation",
      text: action.summary,
      source: "agent",
      action,
      createdAt: new Date(doneAt + run.receipts.length + i).toISOString(),
      turnId: run.turnId,
    })
  }
  for (const [i, replan] of run.replans.entries()) {
    await createMessage(userId, {
      missionId,
      type: "replan",
      text: replan.summary,
      source: "agent",
      replan,
      createdAt: new Date(doneAt + run.receipts.length + run.proposals.length + i).toISOString(),
      turnId: run.turnId,
    })
  }
  await createMessage(userId, {
    missionId,
    type: "reasoning",
    text: run.reply,
    source: "agent",
    promptVersion: run.promptVersion,
    createdAt: new Date(doneAt + run.receipts.length + run.proposals.length + run.replans.length).toISOString(),
    turnId: run.turnId,
  })
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

    const provider = getLlmProvider()
    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error: "AI features are not configured. The mission remains fully usable manually.",
          code: "agent_disabled",
        },
        { status: 503 }
      )
    }
    const paused = await aiPausedResponse()
    if (paused) return paused

    // Rebuild conversation history from stored messages (the DB is the
    // source of truth, not the client).
    const history = toHistory(await listMessages(session.userId, id))
    const sentAt = new Date().toISOString()
    // One id ties the user's message, receipts, reply and every event the
    // turn's tools emit together, so the activity feed can show why (FR-TRS-2).
    const turnId = randomUUID()

    const startedAt = Date.now()
    const turn = {
      provider,
      userId: session.userId,
      missionId: id,
      userMessage: message,
      history,
      turnId,
    }
    const classify = (error: unknown) => ({
      isDailyQuota: isDailyQuotaError(error),
      isTransient: isTransientLlmError(error),
    })
    // Operational metrics only — never message content (NFR-SEC-5, NFR-PERF-1).
    const logTurn = (run: AgentRunResult, firstTextAt: number | null, streamed: boolean) =>
      console.info(
        JSON.stringify({
          event: "chat_turn",
          turnId,
          streamed,
          steps: run.steps,
          toolCalls: run.trace.length,
          ttftMs: firstTextAt === null ? null : firstTextAt - startedAt,
          totalMs: Date.now() - startedAt,
        })
      )

    // Streaming (FR-AGT-1): the chat UI asks for NDJSON — one JSON event per
    // line: text deltas, receipts as tools complete, then "done" (or "error").
    // Other callers get the plain JSON response.
    if (req.headers.get("accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
          let firstTextAt: number | null = null
          try {
            const run = await runAgentTurn({
              ...turn,
              onEvent: (event) => {
                if (event.type === "text") {
                  firstTextAt ??= Date.now()
                  send({ type: "text", delta: event.delta })
                } else if (event.type === "receipt") {
                  send({ type: "receipt", tool: event.receipt.tool, text: event.receipt.text })
                } else if (event.type === "confirmation") {
                  send({ type: "confirmation", action: event.action })
                } else {
                  send({ type: "replan", replan: event.replan })
                }
              },
            })
            await persistTurn(session.userId, id, message, sentAt, run)
            logTurn(run, firstTextAt, true)
            send({
              type: "done",
              reply: run.reply,
              receipts: run.receipts,
              proposals: run.proposals,
              replans: run.replans,
              promptVersion: run.promptVersion,
              turnId,
            })
          } catch (error) {
            const failure = describeLlmFailure(classify(error))
            if (!failure) console.error("POST /api/missions/[id]/chat (stream)", error)
            send({ type: "error", ...(failure ?? { code: "server_error", error: "Chat failed" }) })
          } finally {
            controller.close()
          }
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      })
    }

    let run: AgentRunResult
    try {
      run = await runAgentTurn(turn)
    } catch (error) {
      const unavailable = llmUnavailable(error, classify(error))
      if (unavailable) return unavailable
      throw error
    }
    await persistTurn(session.userId, id, message, sentAt, run)
    logTurn(run, null, false)

    return NextResponse.json({
      success: true,
      data: {
        reply: run.reply,
        receipts: run.receipts,
        proposals: run.proposals,
        replans: run.replans,
        promptVersion: run.promptVersion,
      },
    })
  } catch (err) {
    return serverError("POST /api/missions/[id]/chat", err)
  }
}, { rateLimit: "llm" })
