import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { rejectProposal } from "@/domain/proposals"

/** Reject a proposal: only its status changes — no mission, task or event is touched. */
export const POST = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const outcome = await rejectProposal(session.userId, id)
    switch (outcome.kind) {
      case "rejected":
        return NextResponse.json({ success: true, data: { status: "rejected" } })
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      default:
        return NextResponse.json(
          { success: false, error: "This plan was already decided.", code: "already_decided", ...outcome },
          { status: 409 }
        )
    }
  } catch (err) {
    return serverError("POST /api/plans/[id]/reject", err)
  }
})
