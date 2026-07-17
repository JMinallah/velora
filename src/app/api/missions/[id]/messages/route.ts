import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { listMessages, createMessage } from "@/domain/messages"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const messages = await listMessages(session.userId, id)
    return NextResponse.json({ success: true, data: messages })
  } catch (err) {
    console.error("GET /api/missions/[id]/messages", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})

export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const body = await req.json()
    if (!body.type || !body.text) {
      return NextResponse.json({ success: false, error: "type and text required" }, { status: 400 })
    }

    const created = await createMessage(session.userId, {
      missionId: id,
      type: body.type,
      text: body.text,
      createdAt: body.createdAt,
      source: body.source,
    })
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (err) {
    console.error("POST /api/missions/[id]/messages", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
})
