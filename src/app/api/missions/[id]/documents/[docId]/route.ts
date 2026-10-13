import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { z } from "zod"
import { readJson, validationError } from "@/lib/http"
import { deleteDocument, getDocument, updateDocument } from "@/domain/documents"
import { isoDate } from "@/domain/schemas"

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

const verifySchema = z.object({
  fields: z
    .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) }))
    .max(12)
    .optional(),
  issueDate: isoDate.nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
})

/**
 * Confirm (optionally correcting) the AI-extracted details (FR-DOC-2).
 * Whatever is saved here is the user's own statement: verified.
 */
export const PATCH = withAuth<{ id: string; docId: string }>(async (req, session, { params }) => {
  try {
    const { id, docId } = await params
    const parsed = verifySchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    const doc = await getDocument(session.userId, id, docId)
    if (!doc) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    if (doc.extraction?.status !== "done") {
      return NextResponse.json({ success: false, error: "There are no extracted details to confirm." }, { status: 409 })
    }
    const updated = await updateDocument(session.userId, docId, {
      extraction: {
        ...doc.extraction,
        ...(parsed.data.fields ? { fields: parsed.data.fields } : {}),
        ...(parsed.data.issueDate !== undefined ? { issueDate: parsed.data.issueDate } : {}),
        ...(parsed.data.expiryDate !== undefined ? { expiryDate: parsed.data.expiryDate } : {}),
        verified: true,
        verifiedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return serverError("PATCH /api/missions/[id]/documents/[docId]", error)
  }
})
