import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { consentUpdateSchema, getConsent, updateConsent } from "@/domain/consent"
import { LEGAL_VERSION } from "@/lib/legal"
import { readJson, serverError, validationError } from "@/lib/http"

export const GET = withAuth(async (_req, session) => {
  try {
    return NextResponse.json({ success: true, data: { ...(await getConsent(session.userId)), version: LEGAL_VERSION } })
  } catch (err) {
    return serverError("GET /api/consent", err)
  }
})

/** Accept the current terms (with the 18+ confirmation), or grant/withdraw AI reading of documents. */
export const POST = withAuth(async (req, session) => {
  try {
    const parsed = consentUpdateSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    return NextResponse.json({ success: true, data: { ...(await updateConsent(session.userId, parsed.data)), version: LEGAL_VERSION } })
  } catch (err) {
    return serverError("POST /api/consent", err)
  }
})
