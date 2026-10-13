import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { listDocuments } from "@/domain/documents"

// Documents are created only by completing an upload (./uploads): a client
// can never name a storage location (a client-chosen key could point at
// another user's file once real storage exists).
export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: await listDocuments(session.userId, id) })
  } catch (error) {
    return serverError("GET /api/missions/[id]/documents", error)
  }
})
