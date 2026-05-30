import { NextRequest, NextResponse } from "next/server"
import { attachDocument, listDocumentsForMission } from "@/lib/mongodb/documents"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const documents = await listDocumentsForMission(id)
    return NextResponse.json({ success: true, data: documents })
  } catch (error) {
    console.error("GET /api/missions/[id]/documents", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load documents",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    if (!body?.name) {
      return NextResponse.json({ success: false, error: "Document name is required" }, { status: 400 })
    }

    const created = await attachDocument({
      missionId: id,
      name: body.name,
      mimeType: body.mimeType,
      storageUrl: body.storageUrl,
      extractedText: body.extractedText,
      summary: body.summary,
      extractedFields: body.extractedFields,
    })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    console.error("POST /api/missions/[id]/documents", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to attach document",
      },
      { status: 500 }
    )
  }
}