/** Storage adapters (delivery plan 5-1): signed grants, path safety, R2 presigning — no network. */
import { describe, it, expect, beforeAll } from "vitest"

beforeAll(() => {
  Object.assign(process.env, {
    MONGODB_URI: "mongodb://unused",
    AUTH_SECRET: "s".repeat(40),
    AUTH_GOOGLE_ID: "x",
    AUTH_GOOGLE_SECRET: "x",
    R2_ACCOUNT_ID: "acct123",
    R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "velora-docs",
  })
})

describe("signed file grants", () => {
  it("round-trips, and rejects tampering, malformed tokens and expiry", async () => {
    const { signGrant, verifyGrant } = await import("@/adapters/storage/signed")
    const now = 1_800_000_000
    const token = signGrant({ op: "get", key: "u/m/a.png", contentType: "image/png", filename: "a.png", exp: now + 60 })
    expect(verifyGrant(token, now)).toMatchObject({ ok: true, grant: { key: "u/m/a.png" } })
    expect(verifyGrant(token, now + 61)).toEqual({ ok: false, reason: "expired" })

    const [payload] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ op: "get", key: "other-user/m/b.png", contentType: "image/png", filename: "b", exp: now + 60 })).toString("base64url")
    expect(verifyGrant(`${forged}.${token.split(".")[1]}`, now)).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifyGrant(payload, now)).toEqual({ ok: false, reason: "malformed" })
  })

  it("keeps every link inside the 15-minute limit (NFR-SEC-4)", async () => {
    const { UPLOAD_URL_TTL_SECONDS, VIEW_URL_TTL_SECONDS } = await import("@/adapters/storage/types")
    expect(UPLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60)
    expect(VIEW_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60)
  })
})

describe("local store", () => {
  it("refuses keys that would escape the store", async () => {
    const { localPath } = await import("@/adapters/storage/local")
    expect(() => localPath("../../etc/passwd")).toThrow("invalid storage key")
    expect(localPath("u/m/a.png")).toMatch(/\.data\/uploads\/u\/m\/a\.png$/)
  })
})

describe("R2 store (presigned URLs are computed offline)", () => {
  it("presigns uploads (10 min) and views (5 min) on the account's R2 endpoint", async () => {
    const { r2Store } = await import("@/adapters/storage/r2")
    const upload = new URL((await r2Store.createUploadUrl("u/m/a.pdf", { contentType: "application/pdf", maxBytes: 1 })).url)
    expect(upload.host).toBe("velora-docs.acct123.r2.cloudflarestorage.com")
    expect(upload.searchParams.get("X-Amz-Expires")).toBe("600")

    const view = new URL((await r2Store.createViewUrl("u/m/a.pdf", { filename: 'my "passport".pdf', contentType: "application/pdf" })).url)
    expect(view.searchParams.get("X-Amz-Expires")).toBe("300")
    expect(view.searchParams.get("response-content-disposition")).toBe('inline; filename="my _passport_.pdf"')
  })
})
