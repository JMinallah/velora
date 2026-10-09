import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export type AuthedSession = {
  userId: string
  email: string | null
}

type RouteContext<P> = { params: Promise<P> }

type AuthedHandler<P> = (
  req: NextRequest,
  session: AuthedSession,
  ctx: RouteContext<P>
) => Promise<Response> | Response

/**
 * Deny-by-default route wrapper (docs/04-SECURITY.md §2.1).
 *
 * Every /api route handler must be exported through this wrapper; the only
 * unauthenticated routes are the Auth.js callbacks and explicitly public
 * endpoints, which are listed in docs/04-SECURITY.md and reviewed there.
 * The session's userId — never anything from the request body — is what
 * domain calls must be scoped with.
 */
export function withAuth<P = Record<string, never>>(handler: AuthedHandler<P>) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json(
        { error: { code: "unauthenticated", message: "Sign in required" } },
        { status: 401 }
      )
    }
    return handler(req, { userId, email: session.user?.email ?? null }, ctx)
  }
}
