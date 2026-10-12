import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { getReplanProposal } from "@/domain/replan"
import { listTasks } from "@/domain/tasks"
import { getMission } from "@/domain/missions"

/** A re-plan for review, with the labels of the mission's current tasks (added tasks may depend on them). */
export const GET = withAuth<{ id: string; replanId: string }>(async (_req, session, { params }) => {
  try {
    const { id, replanId } = await params
    const [proposal, mission] = await Promise.all([getReplanProposal(session.userId, id, replanId), getMission(session.userId, id)])
    if (!proposal || !mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    const labels = Object.fromEntries((await listTasks(session.userId, id)).map((t) => [t.id, t.label]))
    return NextResponse.json({ success: true, data: { ...proposal, taskLabels: labels, missionTargetDate: mission.targetDate ?? null } })
  } catch (err) {
    return serverError("GET /api/missions/[id]/replans/[replanId]", err)
  }
})
