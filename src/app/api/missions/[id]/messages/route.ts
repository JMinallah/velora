import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { getMission } from "@/domain/missions"
import { listMessages, createMessage } from "@/domain/messages"
import { messageCreateSchema } from "@/domain/schemas"
import { readJson, serverError, validationError } from "@/lib/http"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const messages = await listMessages(session.userId, id)
    return NextResponse.json({ success: true, data: messages })
  } catch (err) {
    return serverError("GET /api/missions/[id]/messages", err)
  }
})

// Clients can only post their own messages. Agent replies and receipts are
// written server-side by the chat route; accepting a client-chosen type or
// source here would let a client fabricate "agent" turns that the model later
// reads back as its own history.
export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const parsed = messageCreateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)

    const mission = await getMission(session.userId, id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    const created = await createMessage(session.userId, {
      missionId: id,
      type: "user",
      text: parsed.data.text,
      source: "user",
    })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    return serverError("POST /api/missions/[id]/messages", err)
  }
})
