import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { acceptReplan } from "@/domain/replan"

/** Apply the whole re-plan in one transaction — or nothing, if any affected task was edited since. */
export const POST = withAuth<{ id: string; replanId: string }>(async (_req, session, { params }) => {
  try {
    const { id, replanId } = await params
    const outcome = await acceptReplan(session.userId, id, replanId)
    switch (outcome.kind) {
      case "accepted":
        return NextResponse.json({ success: true, data: outcome })
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      case "stale":
        return NextResponse.json({ success: false, error: outcome.message, code: "stale" }, { status: 409 })
      default:
        return NextResponse.json(
          { success: false, error: "This re-plan was already decided.", code: "already_decided", status: "status" in outcome ? outcome.status : undefined },
          { status: 409 }
        )
    }
  } catch (err) {
    return serverError("POST /api/missions/[id]/replans/[replanId]/accept", err)
  }
})
