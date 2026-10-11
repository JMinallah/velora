import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { clientIp, enforceRateLimit, type RateTier } from "@/lib/rate-limit"

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
 *
 * Rate limiting is applied here too, so no route can forget it: GET/HEAD
 * use the "read" tier, other methods "mutation"; routes that call the LLM
 * pass `{ rateLimit: "llm" }`.
 */
export function withAuth<P = Record<string, never>>(
  handler: AuthedHandler<P>,
  options: { rateLimit?: RateTier } = {}
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Sign in required", code: "unauthenticated" },
        { status: 401 }
      )
    }
    const tier = options.rateLimit ?? (req.method === "GET" || req.method === "HEAD" ? "read" : "mutation")
    const limited = await enforceRateLimit(tier, { userId, ip: clientIp(req) })
    if (limited) return limited

    return handler(req, { userId, email: session.user?.email ?? null }, ctx)
  }
}
