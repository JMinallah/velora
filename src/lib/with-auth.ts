import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { clientIp, enforceRateLimit, type RateTier } from "@/lib/rate-limit"
import { log, requestIdFor, withRequestId } from "@/lib/log"
import { countHourly } from "@/domain/ops-metrics"

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
    // Every request gets an id (echoed as x-request-id) that its log lines carry,
    // one "request" log line (metadata only) and a tick on the ops counters.
    const requestId = requestIdFor(req)
    const startedAt = Date.now()
    return withRequestId(requestId, async () => {
      let res: Response
      try {
        res = await authorize(req, ctx)
      } catch (err) {
        log.error("unhandled_route_error", { route: routeOf(req), errorName: err instanceof Error ? err.name : typeof err })
        res = NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
      }
      log.info("request", { method: req.method, route: routeOf(req), status: res.status, ms: Date.now() - startedAt })
      countHourly({ requests: 1, serverErrors: res.status >= 500 ? 1 : 0, rateLimited: res.status === 429 ? 1 : 0 })
      try {
        res.headers.set("x-request-id", requestId)
      } catch {
        // Some responses have immutable headers; the id is still in the logs.
      }
      return res
    })
  }

  async function authorize(req: NextRequest, ctx: RouteContext<P>): Promise<Response> {
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

/** The path with ids collapsed ("/api/missions/:id/tasks/:id"), so logs group by route and carry no identifiers. */
export function routeOf(req: Request): string {
  return new URL(req.url).pathname
    .split("/")
    .map((seg) => (/^[0-9a-f]{24}$|^[0-9a-f-]{36}$|^[A-Za-z0-9_-]{32,}$/i.test(seg) ? ":id" : seg))
    .join("/")
}
