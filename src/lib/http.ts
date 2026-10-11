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
 * The user-facing description of a model-provider failure (NFR-REL-1), or
 * null when it is an unexpected error the caller should treat as a server error.
 */
export function describeLlmFailure(classify: {
  isDailyQuota: boolean
  isTransient: boolean
}): { code: "llm_quota" | "llm_transient"; error: string } | null {
  if (classify.isDailyQuota) {
    return {
      code: "llm_quota",
      error: "Velora's AI has reached its daily limit. It resets at midnight Pacific time — everything else keeps working.",
    }
  }
  if (classify.isTransient) {
    return { code: "llm_transient", error: "The AI service is briefly overloaded — try again in a moment." }
  }
  return null
}

/** describeLlmFailure as a 503 response, or null. */
export function llmUnavailable(_error: unknown, classify: { isDailyQuota: boolean; isTransient: boolean }) {
  const failure = describeLlmFailure(classify)
  return failure ? NextResponse.json({ success: false, ...failure }, { status: 503 }) : null
}
