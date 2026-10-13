/**
 * Private document storage (docs/06-DELIVERY-PLAN.md Phase 5). Files are
 * never public: the browser uploads and views them only through short-lived
 * signed URLs (FR-DOC-1, NFR-SEC-4: ≤ 15 minutes).
 */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60
export const VIEW_URL_TTL_SECONDS = 5 * 60

export type SignedUrl = { url: string; expiresAt: string }

export interface DocumentStore {
  /** "local" or "r2" — stored with each document so a record always knows where its bytes live. */
  readonly kind: "local" | "r2"
  /** A URL the browser PUTs the file to, bound to this key and content type. */
  createUploadUrl(key: string, opts: { contentType: string; maxBytes: number }): Promise<SignedUrl & { headers: Record<string, string> }>
  /** Size and type of a stored object, or null if absent — used to verify an upload before trusting it. */
  head(key: string): Promise<{ size: number; contentType: string } | null>
  /** A URL that shows the file inline to whoever holds it, until it expires. */
  createViewUrl(key: string, opts: { filename: string; contentType: string }): Promise<SignedUrl>
  read(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}

export class StorageUnavailableError extends Error {}

/** Document types accepted (FR-DOC-1: PDF, PNG, JPG ≤ 10 MB) and their extensions. */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
}
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
