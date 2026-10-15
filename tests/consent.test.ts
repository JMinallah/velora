/**
 * Consent records (docs/08-LEGAL-RISKS.md A3/A4/C1): the current terms with
 * an 18+ confirmation, and a separate, revocable consent for AI document
 * reading — stored with version and time, per user.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"

const TEST_URI = process.env.TEST_MONGODB_URI
const describeDb = TEST_URI ? describe : describe.skip

let currentUserId: string | null = null
vi.mock("@/lib/auth", () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId, email: `${currentUserId}@test.dev` } } : null),
}))

import { GET as getConsentRoute, POST as postConsentRoute } from "@/app/api/consent/route"
import { closeClient, getDb } from "@/adapters/db"
import { LEGAL_VERSION } from "@/lib/legal"

beforeAll(async () => {
  if (!TEST_URI) return
  process.env.MONGODB_URI = TEST_URI
  process.env.MONGODB_DB = `velora_test_consent_${Date.now()}`
  process.env.AUTH_SECRET = "x".repeat(32)
  process.env.AUTH_GOOGLE_ID = "x"
  process.env.AUTH_GOOGLE_SECRET = "x"
  await getDb()
})

afterAll(async () => {
  if (!TEST_URI) return
  await (await getDb()).dropDatabase()
  await closeClient()
})

const ctx = { params: Promise.resolve({}) }
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/consent", {
    method,
    headers: { "x-forwarded-for": `10.11.${Math.floor(Math.random() * 250)}.1`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const get = async () => (await (await getConsentRoute(req("GET"), ctx)).json()).data

describeDb("consent", () => {
  it("starts with nothing accepted; accepting the current version with 18+ is recorded with its time", async () => {
    currentUserId = "consent-user"
    expect(await get()).toMatchObject({ current: false, documentAi: false, version: LEGAL_VERSION })

    const res = await postConsentRoute(req("POST", { acceptTerms: LEGAL_VERSION, adult: true }), ctx)
    expect(res.status).toBe(200)
    const after = await get()
    expect(after).toMatchObject({ current: true, record: { termsVersion: LEGAL_VERSION, adultConfirmed: true, acceptedAt: expect.any(String) } })
  })

  it("refuses an outdated version, a missing 18+ confirmation, extra fields and anonymous callers", async () => {
    currentUserId = "consent-strict"
    for (const body of [
      { acceptTerms: "2020-01-01", adult: true },
      { acceptTerms: LEGAL_VERSION },
      { acceptTerms: LEGAL_VERSION, adult: false },
      { acceptTerms: LEGAL_VERSION, adult: true, termsVersion: "x" },
      { documentAi: "yes" },
    ]) {
      expect((await postConsentRoute(req("POST", body), ctx)).status).toBe(400)
    }
    expect((await get()).current).toBe(false)

    currentUserId = null
    expect((await getConsentRoute(req("GET"), ctx)).status).toBe(401)
  })

  it("document reading is a separate consent that can be given and withdrawn, per user", async () => {
    currentUserId = "consent-docs"
    await postConsentRoute(req("POST", { documentAi: true }), ctx)
    expect(await get()).toMatchObject({ documentAi: true, current: false })
    await postConsentRoute(req("POST", { documentAi: false }), ctx)
    expect((await get()).documentAi).toBe(false)
    expect((await get()).record.documentAi).toEqual({ granted: false, at: expect.any(String) })

    currentUserId = "consent-other"
    expect((await get()).documentAi).toBe(false)
  })
})
