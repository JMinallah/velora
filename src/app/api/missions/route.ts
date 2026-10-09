import { NextResponse } from "next/server"
import { listMissions, createMission } from "@/domain/missions"
import { missionCreateSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"
import { withAuth } from "@/lib/with-auth"

export const GET = withAuth(async (_req, session) => {
  try {
    const data = await listMissions(session.userId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return serverError("GET /api/missions", err)
  }
})

export const POST = withAuth(async (req, session) => {
  try {
    const parsed = missionCreateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)

    const created = await createMission(session.userId, parsed.data)
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return serverError("POST /api/missions", err)
  }
})
