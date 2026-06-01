import { NextRequest, NextResponse } from "next/server"
import { attachDocument } from "@/lib/mongodb/documents"
import { createEvent } from "@/lib/mongodb/events"
import { processDocumentRecord } from "@/lib/documents/ingest"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: "File is required" }, { status: 400 })
    }

    const filename = `${Date.now()}-${file.name}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // optional virus/scan hook (stubbed)
    // TODO: integrate ClamAV or third-party scanning
    // if (await virusScanBuffer(buffer) === false) { return NextResponse.json({ success: false, error: 'file failed virus scan' }, { status: 400 }) }

    // upload to storage (GCS if configured, otherwise local uploads)
    const { uploadBufferToStorage } = await import("@/lib/storage/gcs")
    const storageUrl = await uploadBufferToStorage(buffer, filename, file.type || "application/octet-stream")

    const created = await attachDocument({
      missionId: id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      storageUrl,
      extractedText: "",
      summary: "",
      extractedFields: {},
    })

    await createEvent({ missionId: id, type: "document-attached", actor: "user", payload: { documentId: created.id, name: created.name, storageUrl: created.storageUrl } })

    processDocumentRecord(created.id, { buffer }).catch((err) => console.error("background document processing failed", err))

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    console.error("POST /api/missions/[id]/documents/ingest", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to ingest document" }, { status: 500 })
  }
}
