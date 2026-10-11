import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { getProposal } from "@/domain/proposals"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const proposal = await getProposal(session.userId, id)
    if (!proposal) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: proposal })
  } catch (err) {
    return serverError("GET /api/plans/[id]", err)
  }
})
