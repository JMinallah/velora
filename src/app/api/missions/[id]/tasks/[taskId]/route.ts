import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { updateTaskStatus } from "@/lib/mongodb/tasks"
import { createEvent } from "@/lib/mongodb/events"

export const PATCH = withAuth<{ id: string; taskId: string }>(async (_req, _session, { params }) => {
  try {
    const { id, taskId } = await params
    const body = await _req.json()
    if (typeof body.completed !== "boolean") {
      return NextResponse.json({ success: false, error: "completed boolean required" }, { status: 400 })
    }

    const updated = await updateTaskStatus(id, taskId, body.completed)
    if (!updated) return NextResponse.json({ success: false, error: "task not found" }, { status: 404 })

    try {
      await createEvent({ missionId: id, type: "task-updated", actor: "user", payload: { taskId: updated.id, completed: updated.completed } })
    } catch (e) {
      console.error("Failed to create task-updated event", e)
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error("PATCH /api/missions/[id]/tasks/[taskId]", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
