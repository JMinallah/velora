import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { listTasks, createTask } from "@/domain/tasks"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const tasks = await listTasks(session.userId, id)
    return NextResponse.json({ success: true, data: tasks })
  } catch (err) {
    console.error("GET /api/missions/[id]/tasks", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const body = await req.json()
    if (!body.label) return NextResponse.json({ success: false, error: "label required" }, { status: 400 })

    const created = await createTask(session.userId, id, {
      category: body.category ?? "General",
      label: body.label,
      dueDate: body.dueDate ?? null,
      priority: body.priority ?? "medium",
      source: body.source ?? "user",
    })
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/missions/[id]/tasks", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
