import { getDb } from "@/adapters/db"
import { COLLECTIONS, type DocumentRecord } from "@/domain/collections"
import { updateDocument } from "@/domain/documents"

export async function processDocumentRecord(userId: string, documentId: string, input: { buffer: Buffer }) {
  try {
    const db = await getDb()
    const doc = await db
      .collection<DocumentRecord>(COLLECTIONS.documents)
      .findOne({ userId, id: documentId })
    if (!doc) throw new Error("document not found")

    const { buffer } = input
    let extractedText = ""

    // Plain text
    if (doc.mimeType?.startsWith("text/")) {
      extractedText = buffer.toString("utf-8")

    // PDF extraction via optional `pdf-parse`
    } else if (doc.mimeType === "application/pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default ?? (await import("pdf-parse"))
        const data = await pdfParse(buffer)
        extractedText = data?.text ?? ""
      } catch {
        extractedText = "PDF extraction not available — install `pdf-parse` to enable."
      }

    // Images: attempt OCR via optional `tesseract.js`
    } else if (doc.mimeType?.startsWith("image/")) {
      try {
        const { createWorker } = await import("tesseract.js")
        const worker = await createWorker()
        await worker.load()
        await worker.loadLanguage("eng")
        await worker.initialize("eng")
        const { data } = await worker.recognize(buffer)
        extractedText = data?.text ?? ""
        await worker.terminate()
      } catch {
        extractedText = "Image OCR not available — install `tesseract.js` to enable."
      }
    } else {
      extractedText = "Binary document: automatic extraction not supported for this MIME type."
    }

    const summary = extractedText ? extractedText.slice(0, 400) : ""

    // Through the domain layer so the extraction is recorded in the activity feed.
    await updateDocument(userId, documentId, { extractedText, summary }, "system")

    return { success: true }
  } catch (error) {
    console.error("processDocumentRecord error", error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
