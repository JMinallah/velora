import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { updateTask, deleteTask } from "@/domain/tasks"
import { taskPatchSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"

export const PATCH = withAuth<{ id: string; taskId: string }>(async (req, session, { params }) => {
  try {
    const { id, taskId } = await params
    const parsed = taskPatchSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ success: false, error: "no updatable fields provided" }, { status: 400 })
    }

    const updated = await updateTask(session.userId, id, taskId, parsed.data)
    if (!updated) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return serverError("PATCH /api/missions/[id]/tasks/[taskId]", err)
  }
})

export const DELETE = withAuth<{ id: string; taskId: string }>(async (_req, session, { params }) => {
  try {
    const { id, taskId } = await params
    const deleted = await deleteTask(session.userId, id, taskId)
    if (!deleted) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverError("DELETE /api/missions/[id]/tasks/[taskId]", err)
  }
})
