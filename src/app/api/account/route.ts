import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/with-auth"
import { AccountFilesError, DELETE_ACCOUNT_PHRASE, deleteAccount } from "@/domain/account"
import { readJson, serverError, validationError } from "@/lib/http"

// The API checks the typed phrase too, so no stray request can delete an account.
const deleteSchema = z.object({ confirm: z.literal(DELETE_ACCOUNT_PHRASE) })

/** FR-AUTH-3: hard-deletes everything, files included, and ends every session. */
export const DELETE = withAuth(async (req, session) => {
  try {
    const parsed = deleteSchema.safeParse(await readJson(req))
    if (!parsed.success) return validationError(parsed.error)
    await deleteAccount(session.userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AccountFilesError) {
      return NextResponse.json(
        { success: false, error: "Couldn't delete your stored files, so nothing else was deleted. Please try again." },
        { status: 503 }
      )
    }
    return serverError("DELETE /api/account", err)
  }
})
