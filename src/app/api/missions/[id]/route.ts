import { NextResponse } from "next/server"
import { getMission, updateMission, deleteMission } from "@/domain/missions"
import { withAuth } from "@/lib/with-auth"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const mission = await getMission(session.userId, id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: mission })
  } catch (err) {
    console.error("GET /api/missions/[id]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const PATCH = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await updateMission(session.userId, id, body)
    if (!updated) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error("PATCH /api/missions/[id]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const DELETE = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const deleted = await deleteMission(session.userId, id)
    if (!deleted) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/missions/[id]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
