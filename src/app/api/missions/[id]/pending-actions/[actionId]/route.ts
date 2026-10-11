import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { claimAction, finishAction, type PendingActionRecord } from "@/domain/pendingActions"
import { setConfirmationStatus } from "@/domain/messages"
import { destructiveTools, toolRegistry, type DestructiveEffect } from "@/agent/tools"

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
/** A confirmed change's effect, so the UI can update without guessing. */
type ConfirmedEffect = DestructiveEffect | { kind: "data-changed" }

/**
 * Runs a claimed action with the arguments stored at proposal time: a
 * destructive tool's perform(), or — for missions that confirm every change —
 * a write tool's normal execute(), marked as confirmed by the user (which
 * still records its undo snapshot).
 */
async function execute(
  userId: string,
  missionId: string,
  action: PendingActionRecord
): Promise<{ receipt: string; effect: ConfirmedEffect } | { error: string }> {
  const unavailable = { error: "This action can no longer be performed." }
  const destructive = destructiveTools[action.tool]
  if (destructive) {
    const args = destructive.input.safeParse(action.args)
    if (!args.success) return unavailable
    return destructive.perform(userId, missionId, args.data, {
      actor: "agent",
      turnId: action.turnId,
      tool: action.tool,
      args: action.args,
      confirmedBy: "user",
    })
  }
  const write = toolRegistry[action.tool]
  if (write?.tier !== "write") return unavailable
  const args = write.input.safeParse(action.args)
  if (!args.success) return unavailable
  const { result, receipt } = await write.execute(userId, missionId, args.data, {
    turnId: action.turnId,
    confirmedBy: "user",
  })
  const failed = result && typeof result === "object" && "error" in result
  if (failed || !receipt) return { error: "That change can no longer be made — the item may have changed." }
  return { receipt, effect: { kind: "data-changed" } }
}

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
    const result = await execute(session.userId, missionId, outcome.action)

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
