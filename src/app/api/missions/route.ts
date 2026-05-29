import { NextResponse } from "next/server"
import { listMissions, createMission } from "@/lib/mongodb/missions"
import type { CreateMissionInput } from "@/lib/coordination/contracts"

export async function GET() {
  try {
    const data = await listMissions()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error("GET /api/missions error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateMissionInput
    if (!body.title || !body.overview) {
      return NextResponse.json({ success: false, error: "title and overview required" }, { status: 400 })
    }

    const created = await createMission({ title: body.title, subtitle: body.subtitle, overview: body.overview, nextStep: body.nextStep, source: body.source })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/missions error", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
