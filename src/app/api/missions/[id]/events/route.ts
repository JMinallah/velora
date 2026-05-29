import { NextResponse } from "next/server"
import { listEventsForMission } from "@/lib/mongodb/events"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const events = await listEventsForMission(params.id)
    return NextResponse.json({ success: true, data: events })
  } catch (err) {
    console.error("GET /api/missions/[id]/events", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
