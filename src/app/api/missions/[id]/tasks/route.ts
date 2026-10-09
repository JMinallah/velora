import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { listTasks, createTask } from "@/domain/tasks"
import { taskCreateSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const tasks = await listTasks(session.userId, id)
    return NextResponse.json({ success: true, data: tasks })
  } catch (err) {
    return serverError("GET /api/missions/[id]/tasks", err)
  }
})

export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const parsed = taskCreateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)

    // Origin is server-assigned: tasks created through REST are always the user's.
    const created = await createTask(session.userId, id, { ...parsed.data, source: "user" })
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return serverError("POST /api/missions/[id]/tasks", err)
  }
})
