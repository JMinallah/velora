import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"

/**
 * Structured server logs (NFR-OBS-1): one JSON object per line, carrying the
 * request id of the API request being served.
 *
 * Logs hold metadata, never content (NFR-SEC-5): fields whose names suggest
 * user content, addresses or secrets are replaced with "[redacted]" even if
 * a caller passes them by mistake.
 */

type Level = "info" | "warn" | "error"
type Fields = Record<string, unknown>

const requestContext = new AsyncLocalStorage<{ requestId: string }>()

const REDACTED_KEYS = new Set([
  "text",
  "content",
  "body",
  "prompt",
  "reply",
  "usermessage",
  "details",
  "email",
  "to",
  "authorization",
  "cookie",
  "token",
  "nonce",
  "password",
  "secret",
  "apikey",
])

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(v, depth + 1)])
  )
}

/** An error as loggable fields: its kind and a bounded message, no stack (enough to find it, nothing more). */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) {
    const status = (error as { status?: unknown; code?: unknown }).status ?? (error as { code?: unknown }).code
    return { errorName: error.name, errorMessage: error.message.slice(0, 300), ...(status !== undefined ? { errorCode: status } : {}) }
  }
  return { errorName: typeof error, errorMessage: String(error).slice(0, 300) }
}

function write(level: Level, event: string, fields: Fields = {}) {
  const requestId = requestContext.getStore()?.requestId
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...(redact(fields) as Fields),
  })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
}

/**
 * The request id for an incoming request: the caller's or the platform's
 * when it looks like an id (so logs line up with the host's), else a new one.
 */
export function requestIdFor(req: Request): string {
  for (const header of ["x-request-id", "x-vercel-id"]) {
    const value = req.headers.get(header)
    if (value && /^[A-Za-z0-9:._-]{8,128}$/.test(value)) return value
  }
  return randomUUID()
}

export function withRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn)
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId
}
