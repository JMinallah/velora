import fs from "fs"
import path from "path"
import { getDb } from "@/lib/mongodb/client"
import { COLLECTIONS } from "@/lib/mongodb/models"
import type { DocumentRecord } from "@/lib/mongodb/models"

export async function processDocumentRecord(documentId: string, input: { filePath?: string; buffer?: Buffer }) {
  try {
    const db = await getDb()
    const doc = await db.collection<DocumentRecord>(COLLECTIONS.documents).findOne({ id: documentId })
    if (!doc) throw new Error("document not found")

    const buffer = input.buffer ?? (input.filePath ? await fs.promises.readFile(input.filePath) : null)
    if (!buffer) throw new Error("document content is required")
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

    await db
      .collection(COLLECTIONS.documents)
      .updateOne({ id: documentId }, { $set: { extractedText, summary } })

    // processed marker file
    if (input.filePath) {
      try {
        await fs.promises.writeFile(path.join(path.dirname(input.filePath), `${path.basename(input.filePath)}.processed`), new Date().toISOString())
      } catch {
        // ignore
      }
    }

    return { success: true }
  } catch (error) {
    console.error("processDocumentRecord error", error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function scanAndProcessPendingUploads() {
  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  try {
    const files = await fs.promises.readdir(uploadsDir)
    for (const file of files) {
      if (file.endsWith(".processed")) continue
      const filePath = path.join(uploadsDir, file)
      const db = await getDb()
      const storageUrl = `/uploads/${file}`
      const doc = await db.collection<DocumentRecord>(COLLECTIONS.documents).findOne({ storageUrl })
      if (doc && !doc.extractedText) {
        await processDocumentRecord(doc.id, { filePath })
      }
    }
  } catch {
    // ignore if folder missing
  }
}
