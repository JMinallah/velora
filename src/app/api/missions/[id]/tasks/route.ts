import { NextResponse } from "next/server"
import { listTasksForMission, createTask } from "@/lib/mongodb/tasks"
import { createEvent } from "@/lib/mongodb/events"

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

    // record an event for created task
    try {
      await createEvent({ missionId: id, type: "task-created", actor: "user", payload: { taskId: created.id, label: created.label } })
    } catch (e) {
      console.error("Failed to create task event", e)
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/missions/[id]/tasks", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
