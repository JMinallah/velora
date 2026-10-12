import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { rejectReplan } from "@/domain/replan"

/** Reject: the mission stays byte-identical; only the proposal's status changes. */
export const POST = withAuth<{ id: string; replanId: string }>(async (_req, session, { params }) => {
  try {
    const { id, replanId } = await params
    const outcome = await rejectReplan(session.userId, id, replanId)
    if (outcome.kind === "rejected") return NextResponse.json({ success: true, data: { status: "rejected" } })
    if (outcome.kind === "not_found") return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: false, error: "This re-plan was already decided.", code: "already_decided" }, { status: 409 })
  } catch (err) {
    return serverError("POST /api/missions/[id]/replans/[replanId]/reject", err)
  }
})
