import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { exportAccount } from "@/domain/account"
import { serverError } from "@/lib/http"

/** FR-AUTH-4: all of the user's data as one JSON file. */
export const GET = withAuth(async (_req, session) => {
  try {
    const data = await exportAccount(session.userId)
    const day = data.exportedAt.slice(0, 10)
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="velora-export-${day}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return serverError("GET /api/account/export", err)
  }
})
