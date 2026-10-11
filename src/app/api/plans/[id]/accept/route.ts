import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { missionPlanSchema, planDateIssues } from "@/domain/plan"
import { acceptProposal } from "@/domain/proposals"

const acceptSchema = z.object({ plan: missionPlanSchema })

/**
 * Accept a proposal, as the user edited it. The edited plan is validated
 * again here (same schema, dates not in the past or after the target), then
 * the mission and all its tasks are created in one transaction.
 */
export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const parsed = acceptSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const dateIssues = planDateIssues(parsed.data.plan, new Date().toISOString().slice(0, 10))
    if (dateIssues.length) return NextResponse.json({ success: false, error: dateIssues.join("; ") }, { status: 400 })

    const outcome = await acceptProposal(session.userId, id, parsed.data.plan)
    switch (outcome.kind) {
      case "accepted":
        return NextResponse.json({ success: true, data: { missionId: outcome.missionId } })
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      default:
        return NextResponse.json(
          { success: false, error: "This plan was already decided.", code: "already_decided", ...outcome },
          { status: 409 }
        )
    }
  } catch (err) {
    return serverError("POST /api/plans/[id]/accept", err)
  }
})
