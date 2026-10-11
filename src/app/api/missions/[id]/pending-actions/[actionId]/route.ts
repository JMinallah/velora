import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { claimAction, finishAction } from "@/domain/pendingActions"
import { setConfirmationStatus } from "@/domain/messages"
import { destructiveTools } from "@/agent/tools"

const decisionSchema = z.object({
  nonce: z.string().min(1).max(200),
  decision: z.enum(["confirm", "reject"]),
})

/**
 * The only path by which a destructive agent action executes
 * (docs/03-AGENT-DESIGN.md §5): an authenticated request from the mission's
 * owner, carrying the single-use nonce shown on the confirmation card. The
 * arguments executed are the ones stored when the action was proposed.
 *
 *   unknown or another user's action → 404   wrong nonce → 403
 *   already decided (incl. replay)  → 409    expired     → 410
 */
export const POST = withAuth<{ id: string; actionId: string }>(async (req, session, { params }) => {
  try {
    const { id: missionId, actionId } = await params
    const parsed = decisionSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const { nonce, decision } = parsed.data

    const outcome = await claimAction(session.userId, missionId, actionId, nonce, decision)
    switch (outcome.kind) {
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      case "bad_nonce":
        return NextResponse.json({ success: false, error: "This confirmation is not valid." }, { status: 403 })
      case "already_decided":
        return NextResponse.json(
          { success: false, error: "This action was already decided.", code: "already_decided", status: outcome.status },
          { status: 409 }
        )
      case "expired":
        await setConfirmationStatus(session.userId, actionId, "expired")
        return NextResponse.json(
          { success: false, error: "This confirmation expired. Ask Velora again if you still want it.", code: "expired" },
          { status: 410 }
        )
      case "rejected":
        await setConfirmationStatus(session.userId, actionId, "rejected")
        return NextResponse.json({ success: true, data: { status: "rejected" } })
    }

    // Claimed for execution — exactly once.
    const { action } = outcome
    const tool = destructiveTools[action.tool]
    const args = tool?.input.safeParse(action.args)
    const result =
      tool && args?.success
        ? await tool.perform(session.userId, missionId, args.data, {
            actor: "agent",
            turnId: action.turnId,
            tool: action.tool,
            args: action.args,
            confirmedBy: "user",
          })
        : { error: "This action can no longer be performed." }

    if ("error" in result) {
      await finishAction(session.userId, actionId, "failed")
      await setConfirmationStatus(session.userId, actionId, "failed")
      return NextResponse.json({ success: false, error: result.error, code: "action_failed" }, { status: 409 })
    }

    await finishAction(session.userId, actionId, "executed")
    // A deleted mission takes its messages with it; nothing left to update.
    if (result.effect.kind !== "mission-deleted") await setConfirmationStatus(session.userId, actionId, "executed")
    return NextResponse.json({ success: true, data: { status: "executed", receipt: result.receipt, effect: result.effect } })
  } catch (err) {
    return serverError("POST /api/missions/[id]/pending-actions/[actionId]", err)
  }
})
