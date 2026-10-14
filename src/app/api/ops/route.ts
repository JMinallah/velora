import { NextResponse } from "next/server"
import { withAuth } from "@/lib/with-auth"
import { isAdmin } from "@/lib/env"
import { opsSnapshot } from "@/domain/ops"
import { serverError } from "@/lib/http"

/** The ops page's data (NFR-OBS-3). Admins only (ADMIN_EMAILS); anyone else gets 404, like any resource that isn't theirs. */
export const GET = withAuth(async (_req, session) => {
  if (!isAdmin(session.email)) return NextResponse.json({ success: false, error: "not found" }, { status: 404 })
  try {
    return NextResponse.json({ success: true, data: await opsSnapshot() })
  } catch (err) {
    return serverError("GET /api/ops", err)
  }
})
