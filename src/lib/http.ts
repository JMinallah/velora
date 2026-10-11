import { NextResponse } from "next/server"
import type { ZodError } from "zod"

/** Parses a JSON body, returning null (not throwing) on malformed input so routes can answer 400. */
export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}

export function validationError(error: ZodError) {
  const message = error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ")
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

/** Logs the real error server-side; the client only ever sees a generic message. */
export function serverError(route: string, err: unknown) {
  console.error(route, err)
  return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
}

/**
 * Maps a model-provider failure to an honest 503 (NFR-REL-1), or null when it
 * is an unexpected error the caller should treat as a server error.
 */
export function llmUnavailable(error: unknown, classify: { isDailyQuota: boolean; isTransient: boolean }) {
  if (classify.isDailyQuota) {
    return NextResponse.json(
      {
        success: false,
        error: "Velora's AI has reached its daily limit. It resets at midnight Pacific time — everything else keeps working.",
        code: "llm_quota",
      },
      { status: 503 }
    )
  }
  if (classify.isTransient) {
    return NextResponse.json(
      { success: false, error: "The AI service is briefly overloaded — try again in a moment.", code: "llm_transient" },
      { status: 503 }
    )
  }
  return null
}
