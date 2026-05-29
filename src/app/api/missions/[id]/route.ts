import { NextResponse } from "next/server"
import { getMission, updateMission } from "@/lib/mongodb/missions"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const mission = await getMission(id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: mission })
  } catch (err) {
    console.error("GET /api/missions/[id]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await req.json()
    const updated = await updateMission(id, body)
    if (!updated) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error("PATCH /api/missions/[id]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
