import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { attachDocument } from "@/domain/documents"
import { processDocumentRecord } from "@/lib/documents/ingest"

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"])

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: "File is required" }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "File exceeds 10 MB limit" }, { status: 413 })
    }
    const mimeType = file.type || "application/octet-stream"
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ success: false, error: `Unsupported file type: ${mimeType}` }, { status: 415 })
    }

    const filename = `${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { uploadBufferToStorage } = await import("@/lib/storage/gcs")
    const storageUrl = await uploadBufferToStorage(buffer, filename, mimeType)

    const created = await attachDocument(session.userId, id, {
      name: file.name,
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
    return serverError("POST /api/missions/[id]/documents/ingest", error)
  }
})
