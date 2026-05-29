import { NextResponse } from "next/server"
import { listTasksForMission, createTask } from "@/lib/mongodb/tasks"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const tasks = await listTasksForMission(id)
    return NextResponse.json({ success: true, data: tasks })
  } catch (err) {
    console.error("GET /api/missions/[id]/tasks", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await req.json()
    if (!body.label) return NextResponse.json({ success: false, error: "label required" }, { status: 400 })

    const created = await createTask({ missionId: id, category: body.category ?? "General", label: body.label, dueDate: body.dueDate ?? null, priority: body.priority ?? "medium", source: body.source ?? "agent" })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/missions/[id]/tasks", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
