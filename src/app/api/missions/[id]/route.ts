import { NextResponse } from "next/server"
import { getMission, updateMission, deleteMission } from "@/domain/missions"
import { missionPatchSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"
import { withAuth } from "@/lib/with-auth"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const mission = await getMission(session.userId, id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: mission })
  } catch (err) {
    return serverError("GET /api/missions/[id]", err)
  }
})

export const PATCH = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    // Unknown keys (userId, id, createdAt, ...) are stripped by the schema.
    const parsed = missionPatchSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ success: false, error: "no updatable fields provided" }, { status: 400 })
    }

    const updated = await updateMission(session.userId, id, parsed.data)
    if (!updated) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return serverError("PATCH /api/missions/[id]", err)
  }
})

export const DELETE = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const deleted = await deleteMission(session.userId, id)
    if (!deleted) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverError("DELETE /api/missions/[id]", err)
  }
})
