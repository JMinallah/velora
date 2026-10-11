import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { getMission } from "@/domain/missions"
import { latestUndoable, undoChange } from "@/domain/undo"

/** GET: the agent's most recent undoable change in this mission, or null. */
export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    if (!(await getMission(session.userId, id))) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: await latestUndoable(session.userId, id) })
  } catch (err) {
    return serverError("GET /api/missions/[id]/undo", err)
  }
})

const undoSchema = z.object({ eventId: z.string().min(1).max(100) })

/**
 * POST { eventId }: undo that change. The id must be the latest undoable one
 * (what the user was shown), so a stale button can't undo something else.
 *   nothing to undo / not the latest → 409   edited since → 409 (conflict)
 */
export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const parsed = undoSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    if (!(await getMission(session.userId, id))) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }

    const outcome = await undoChange(session.userId, id, parsed.data.eventId)
    switch (outcome.kind) {
      case "undone":
        return NextResponse.json({
          success: true,
          data: { undid: outcome.description, taskId: outcome.taskId, next: await latestUndoable(session.userId, id) },
        })
      case "nothing":
        return NextResponse.json({ success: false, error: "There's nothing to undo.", code: "nothing_to_undo" }, { status: 409 })
      case "not_latest":
        return NextResponse.json(
          { success: false, error: "Only Velora's most recent change can be undone.", code: "not_latest" },
          { status: 409 }
        )
      case "conflict":
        return NextResponse.json({ success: false, error: outcome.message, code: "edited_since" }, { status: 409 })
    }
  } catch (err) {
    return serverError("POST /api/missions/[id]/undo", err)
  }
})
