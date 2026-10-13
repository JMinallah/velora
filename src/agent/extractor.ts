import { z } from "zod"
import type { LlmProvider } from "./providers/types"
import { structuredOutputSchema } from "./json-schema"
import { extractorPrompt, extractorSystemPrompt, EXTRACTOR_PROMPT_VERSION } from "./prompts/extractor.v1"
import { isoDate } from "@/domain/schemas"

/**
 * Quarantined document extraction (delivery plan 5-3, FR-DOC-2/3,
 * 04-SECURITY §4): one structured-output call with the file attached and NO
 * tools and NO history, so a document — however adversarial — can only
 * yield data in this schema. The result is stored as unverified until the
 * user confirms it.
 */
export const DOCUMENT_TYPES = [
  "passport",
  "visa",
  "work-permit",
  "residence-permit",
  "id-card",
  "offer-letter",
  "employment-contract",
  "lease",
  "bank-statement",
  "insurance",
  "certificate",
  "transcript",
  "medical",
  "ticket",
  "other",
] as const

export const documentExtractionSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(400),
  fields: z
    .array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) }))
    .max(12)
    .default([]),
  issueDate: isoDate.nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
  /** The document contained text addressed to an AI (e.g. instructions); it was ignored. */
  containsInstructions: z.boolean().default(false),
})
export type DocumentExtraction = z.infer<typeof documentExtractionSchema>

const MAX_ATTEMPTS = 2
const ATTEMPT_TIMEOUT_MS = 45_000

export class ExtractionError extends Error {}

let cachedSchema: Record<string, unknown> | null = null

export async function extractDocument(input: {
  provider: LlmProvider
  mimeType: string
  data: Buffer
}): Promise<{ extraction: DocumentExtraction; promptVersion: string }> {
  if (!input.provider.generateStructured) throw new Error("This model provider cannot read documents")
  cachedSchema ??= structuredOutputSchema(documentExtractionSchema)
  let problem = ""
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await input.provider.generateStructured({
      system: extractorSystemPrompt,
      prompt: attempt === 1 ? extractorPrompt : `${extractorPrompt}\n\nYour previous answer was invalid (${problem}). Return valid JSON for the schema.`,
      jsonSchema: cachedSchema,
      attachments: [{ mimeType: input.mimeType, data: input.data }],
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
    try {
      const parsed = documentExtractionSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return { extraction: parsed.data, promptVersion: EXTRACTOR_PROMPT_VERSION }
      problem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join("; ")
    } catch {
      problem = "not valid JSON"
    }
  }
  throw new ExtractionError(`The document could not be read into a valid form: ${problem}`)
}
