import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { listEventsForMission } from "@/lib/mongodb/events"

export const GET = withAuth<{ id: string }>(async (_req, _session, { params }) => {
  try {
    const { id } = await params
    const events = await listEventsForMission(id)
    return NextResponse.json({ success: true, data: events })
  } catch (err) {
    console.error("GET /api/missions/[id]/events", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
