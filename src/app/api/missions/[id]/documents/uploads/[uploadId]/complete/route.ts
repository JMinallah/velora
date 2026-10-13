import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { completeUpload } from "@/domain/uploads"

/** Step 3: the server verifies the stored object against what was declared, then creates the document. */
export const POST = withAuth<{ id: string; uploadId: string }>(async (_req, session, { params }) => {
  try {
    const { id, uploadId } = await params
    const outcome = await completeUpload(session.userId, id, uploadId)
    switch (outcome.kind) {
      case "ok":
        // Extraction (quarantined multimodal analysis, delivery plan 5-3) runs from here once it lands.
        return NextResponse.json({ success: true, data: outcome.document }, { status: 201 })
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      case "already_completed":
        return NextResponse.json({ success: false, error: "This upload was already completed." }, { status: 409 })
      case "missing":
        return NextResponse.json({ success: false, error: "The file hasn't been uploaded yet." }, { status: 409 })
      case "mismatch":
        return NextResponse.json({ success: false, error: outcome.message }, { status: 422 })
    }
  } catch (error) {
    return serverError("POST /api/missions/[id]/documents/uploads/[uploadId]/complete", error)
  }
})
