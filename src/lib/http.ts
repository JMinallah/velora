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
