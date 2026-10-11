import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { getMission } from "@/domain/missions"
import { attachDocument } from "@/domain/documents"
import { processDocumentRecord } from "@/lib/documents/ingest"
import { ALLOWED_DOCUMENT_TYPES, StorageUnavailableError, storeDocument } from "@/lib/storage/gcs"

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Display name only — never used as a storage path. Strips any directory part and control characters. */
function displayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255)
  return clean || "document"
}

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  try {
    const { id } = await params

    // Ownership first: nothing is read or stored for a mission that isn't the caller's.
    const mission = await getMission(session.userId, id)
    if (!mission) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    const formData = await request.formData().catch(() => null)
    const file = formData?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "File is required" }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "File exceeds 10 MB limit" }, { status: 413 })
    }
    const mimeType = file.type || "application/octet-stream"
    if (!ALLOWED_DOCUMENT_TYPES.has(mimeType)) {
      return NextResponse.json({ success: false, error: `Unsupported file type: ${mimeType}` }, { status: 415 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storageUrl = await storeDocument(session.userId, buffer, mimeType)

    const created = await attachDocument(session.userId, id, {
      name: displayName(file.name),
      mimeType,
      storageUrl,
      extractedText: "",
      summary: "",
      extractedFields: {},
    })
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    processDocumentRecord(session.userId, created.id, { buffer }).catch((err) =>
      console.error("background document processing failed", err)
    )

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return NextResponse.json(
        { success: false, error: "Document uploads are not available yet.", code: "storage_unavailable" },
        { status: 503 }
      )
    }
    return serverError("POST /api/missions/[id]/documents/ingest", error)
  }
})
