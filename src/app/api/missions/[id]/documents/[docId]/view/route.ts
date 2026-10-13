import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { serverError } from "@/lib/http"
import { getDocument } from "@/domain/documents"
import { storeFor } from "@/adapters/storage"

/** A short-lived link (≤ 15 min, NFR-SEC-4) to view the file — issued only to its owner. */
export const GET = withAuth<{ id: string; docId: string }>(async (_req, session, { params }) => {
  try {
    const { id, docId } = await params
    const doc = await getDocument(session.userId, id, docId)
    if (!doc || !/^(local|r2):/.test(doc.storageUrl)) {
      return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
    }
    const { store, key } = storeFor(doc.storageUrl)
    const link = await store.createViewUrl(key, { filename: doc.name, contentType: doc.mimeType })
    return NextResponse.json({ success: true, data: link })
  } catch (error) {
    return serverError("GET /api/missions/[id]/documents/[docId]/view", error)
  }
})
