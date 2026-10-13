import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { readJson, serverError, validationError } from "@/lib/http"
import { StorageUnavailableError } from "@/adapters/storage"
import { startUpload } from "@/domain/uploads"

const startSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
})

/** Step 1 of an upload: checks ownership, type and size, then returns a signed upload URL. */
export const POST = withAuth<{ id: string }>(async (req, session, { params }) => {
  try {
    const { id } = await params
    const parsed = startSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const outcome = await startUpload(session.userId, id, parsed.data)
    switch (outcome.kind) {
      case "ok":
        return NextResponse.json({ success: true, data: outcome }, { status: 201 })
      case "not_found":
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      case "unsupported_type":
        return NextResponse.json({ success: false, error: "Only PDF, PNG and JPG files can be uploaded." }, { status: 415 })
      case "too_large":
        return NextResponse.json({ success: false, error: "Files can be at most 10 MB." }, { status: 413 })
    }
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return NextResponse.json(
        { success: false, error: "Document uploads are not available yet.", code: "storage_unavailable" },
        { status: 503 }
      )
    }
    return serverError("POST /api/missions/[id]/documents/uploads", error)
  }
})
