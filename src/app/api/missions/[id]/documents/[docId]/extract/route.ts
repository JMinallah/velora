import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { aiPausedResponse, llmUnavailable, serverError } from "@/lib/http"
import { env } from "@/lib/env"
import { getDocument, updateDocument } from "@/domain/documents"
import { storeFor } from "@/adapters/storage"
import { getLlmProvider } from "@/agent/providers"
import { isDailyQuotaError, isTransientLlmError } from "@/agent/providers/gemini"
import { extractDocument, ExtractionError } from "@/agent/extractor"
import { log } from "@/lib/log"

/**
 * Reads a document with the quarantined extractor (FR-DOC-2/3): no tools, no
 * history. The result is stored as AI-extracted and unverified.
 */
export const POST = withAuth<{ id: string; docId: string }>(
  async (_req, session, { params }) => {
    try {
      const { id, docId } = await params
      const doc = await getDocument(session.userId, id, docId)
      if (!doc || !/^(local|r2):/.test(doc.storageUrl)) {
        return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
      }
      const provider = getLlmProvider()
      if (!provider) {
        return NextResponse.json(
          { success: false, error: "Velora can't read documents right now — AI is not available.", code: "agent_disabled" },
          { status: 503 }
        )
      }
      const paused = await aiPausedResponse()
      if (paused) return paused

      const { store, key } = storeFor(doc.storageUrl)
      const bytes = await store.read(key)
      let result
      try {
        result = await extractDocument({ provider, mimeType: doc.mimeType, data: bytes })
      } catch (error) {
        if (error instanceof ExtractionError) {
          const failed = await updateDocument(
            session.userId,
            docId,
            { extraction: { status: "failed", fields: [], verified: false, extractedAt: new Date().toISOString() } },
            "system"
          )
          return NextResponse.json(
            { success: false, error: "Velora couldn't read this document.", code: "extraction_failed", data: failed },
            { status: 422 }
          )
        }
        const unavailable = llmUnavailable(error, { isDailyQuota: isDailyQuotaError(error), isTransient: isTransientLlmError(error) })
        if (unavailable) return unavailable
        throw error
      }

      const { extraction, promptVersion } = result
      const updated = await updateDocument(
        session.userId,
        docId,
        {
          summary: extraction.summary,
          extraction: {
            status: "done",
            documentType: extraction.documentType,
            title: extraction.title,
            fields: extraction.fields,
            issueDate: extraction.issueDate ?? null,
            expiryDate: extraction.expiryDate ?? null,
            containsInstructions: extraction.containsInstructions,
            verified: false,
            promptVersion,
            model: env().GEMINI_MODEL,
            extractedAt: new Date().toISOString(),
          },
        },
        "system"
      )
      if (extraction.containsInstructions) {
        // Metadata only — never the document's content (NFR-SEC-5).
        log.warn("document_contains_instructions", { documentId: docId })
      }
      return NextResponse.json({ success: true, data: updated })
    } catch (err) {
      return serverError("POST /api/missions/[id]/documents/[docId]/extract", err)
    }
  },
  { rateLimit: "llm" }
)
