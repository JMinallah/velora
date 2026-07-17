import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => authMock(...args) }))

import { withAuth } from "@/lib/with-auth"

const req = () => new NextRequest("http://localhost/api/example")
const ctx = { params: Promise.resolve({}) }

describe("withAuth (deny-by-default route wrapper)", () => {
  beforeEach(() => authMock.mockReset())

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
})
