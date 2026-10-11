import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { documentCreateSchema } from "@/domain/schemas"
import { attachDocument, listDocuments } from "@/domain/documents"

export const GET = withAuth<{ id: string }>(async (_req, session, { params }) => {
  try {
    const { id } = await params
    const documents = await listDocuments(session.userId, id)
    return NextResponse.json({ success: true, data: documents })
  } catch (error) {
    return serverError("GET /api/missions/[id]/documents", error)
  }
})

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  try {
    const { id } = await params
    const parsed = documentCreateSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)

    const created = await attachDocument(session.userId, id, parsed.data)
    if (!created) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    return serverError("POST /api/missions/[id]/documents", error)
  }
})
