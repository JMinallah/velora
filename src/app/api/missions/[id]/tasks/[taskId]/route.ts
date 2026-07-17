import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { updateTask, deleteTask } from "@/domain/tasks"

export const PATCH = withAuth<{ id: string; taskId: string }>(async (req, session, { params }) => {
  try {
    const { id, taskId } = await params
    const body = await req.json()

    const patch: Record<string, unknown> = {}
    if (typeof body.completed === "boolean") patch.completed = body.completed
    if (typeof body.label === "string") patch.label = body.label
    if (typeof body.category === "string") patch.category = body.category
    if (body.dueDate === null || typeof body.dueDate === "string") patch.dueDate = body.dueDate
    if (["low", "medium", "high"].includes(body.priority)) patch.priority = body.priority
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: "no updatable fields provided" }, { status: 400 })
    }

    const updated = await updateTask(session.userId, id, taskId, patch)
    if (!updated) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error("PATCH /api/missions/[id]/tasks/[taskId]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const DELETE = withAuth<{ id: string; taskId: string }>(async (_req, session, { params }) => {
  try {
    const { id, taskId } = await params
    const deleted = await deleteTask(session.userId, id, taskId)
    if (!deleted) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/missions/[id]/tasks/[taskId]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
