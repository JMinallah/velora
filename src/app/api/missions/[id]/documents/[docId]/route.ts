import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { deleteDocument } from "@/domain/documents"

/** Deletes the document and its stored file. */
export const DELETE = withAuth<{ id: string; docId: string }>(async (_req, session, { params }) => {
  try {
    const { id, docId } = await params
    if (!(await deleteDocument(session.userId, id, docId))) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError("DELETE /api/missions/[id]/documents/[docId]", error)
  }
})
