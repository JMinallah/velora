import { describe, it, expect } from "vitest"
import { parseServerEnv } from "@/lib/env"

const validEnv = {
  MONGODB_URI: "mongodb+srv://u:p@cluster.example.mongodb.net",
  AUTH_SECRET: "a".repeat(32),
  AUTH_GOOGLE_ID: "client-id",
  AUTH_GOOGLE_SECRET: "client-secret",
}

describe("parseServerEnv", () => {
  it("accepts a complete core config and applies documented defaults", () => {
    const env = parseServerEnv(validEnv)
    expect(env.MONGODB_DB).toBe("velora")
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash")
  })

  it("names every missing required var in the error", () => {
    expect(() => parseServerEnv({})).toThrowError(/MONGODB_URI/)
    expect(() => parseServerEnv({})).toThrowError(/AUTH_SECRET/)
    expect(() => parseServerEnv({})).toThrowError(/AUTH_GOOGLE_ID/)
  })

  it("rejects a short AUTH_SECRET instead of silently accepting it", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, AUTH_SECRET: "dev-secret" })
    ).toThrowError(/AUTH_SECRET/)
  })

  it("has no fallback for secrets: absent optional keys stay absent", () => {
    const env = parseServerEnv(validEnv)
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.AUTH_RESEND_KEY).toBeUndefined()
    expect(env.CRON_SECRET).toBeUndefined()
  })
})
