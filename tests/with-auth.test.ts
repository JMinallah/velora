import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => authMock(...args) }))

// The limiter itself is DB-backed and covered in tests/routes.test.ts; here
// we only check which tier withAuth asks for and that a 429 short-circuits.
const enforceMock = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "203.0.113.7",
  enforceRateLimit: (...args: unknown[]) => enforceMock(...args),
}))

import { withAuth } from "@/lib/with-auth"

const req = () => new NextRequest("http://localhost/api/example")
const ctx = { params: Promise.resolve({}) }

describe("withAuth (deny-by-default route wrapper)", () => {
  beforeEach(() => {
    authMock.mockReset()
    enforceMock.mockReset().mockResolvedValue(null)
  })

  it("returns 401 and never calls the handler when there is no session", async () => {
    authMock.mockResolvedValue(null)
    const handler = vi.fn()
    const res = await withAuth(handler)(req(), ctx)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 401 when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: { email: "x@example.com" } })
    const handler = vi.fn()
    const res = await withAuth(handler)(req(), ctx)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("passes the session userId — not request data — to the handler", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", email: "x@example.com" } })
    const handler = vi.fn().mockResolvedValue(new Response("ok"))
    const res = await withAuth(handler)(req(), ctx)
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-1", email: "x@example.com" },
      ctx
    )
  })

  it("never consults the rate limiter for anonymous requests", async () => {
    authMock.mockResolvedValue(null)
    await withAuth(vi.fn())(req(), ctx)
    expect(enforceMock).not.toHaveBeenCalled()
  })

  it("rate-limits GET as read, other methods as mutation, and honours an explicit tier", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    const ok = vi.fn().mockResolvedValue(new Response("ok"))
    const subjects = { userId: "user-1", ip: "203.0.113.7" }

    await withAuth(ok)(new NextRequest("http://localhost/api/x"), ctx)
    expect(enforceMock).toHaveBeenLastCalledWith("read", subjects)

    await withAuth(ok)(new NextRequest("http://localhost/api/x", { method: "PATCH" }), ctx)
    expect(enforceMock).toHaveBeenLastCalledWith("mutation", subjects)

    await withAuth(ok, { rateLimit: "llm" })(new NextRequest("http://localhost/api/x", { method: "POST" }), ctx)
    expect(enforceMock).toHaveBeenLastCalledWith("llm", subjects)
  })

  it("returns the limiter's 429 without calling the handler", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    enforceMock.mockResolvedValue(new Response("slow down", { status: 429 }))
    const handler = vi.fn()
    const res = await withAuth(handler)(req(), ctx)
    expect(res.status).toBe(429)
    expect(handler).not.toHaveBeenCalled()
  })
})
