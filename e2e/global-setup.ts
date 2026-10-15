import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { MongoClient, ObjectId, type Db } from "mongodb"
import { E2E_DB } from "../playwright.config"
import { startAiServer } from "./ai-server"
import { LEGAL_VERSION } from "../src/lib/legal"

/**
 * Starts every run from an empty database and signs a test user in by
 * writing the same user + session documents the Auth.js MongoDB adapter
 * creates after a real Google sign-in, then storing the session cookie
 * (valid on both servers: cookies are per host, not per port). Then starts
 * the AI-enabled server; the returned function stops it after the run.
 */
export default async function globalSetup() {
  const uri = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017"
  const client = await new MongoClient(uri).connect()
  try {
    const db = client.db(E2E_DB)
    await db.dropDatabase()

    // Two users, so the AI specs' data never shows up in the manual specs'
    // dashboards: e2e@velora.test (zero-AI server) and ai@velora.test (AI server).
    const zeroAi = await signIn(db, "e2e@velora.test", "E2E User")
    const ai = await signIn(db, "ai@velora.test", "E2E AI User")
    // Both have accepted the current terms (the first-visit consent screen is tested with a third, fresh user).
    for (const { userId } of [zeroAi, ai]) {
      await db.collection("user_settings").insertOne({
        userId,
        consent: { termsVersion: LEGAL_VERSION, acceptedAt: new Date().toISOString(), adultConfirmed: true },
      })
    }
    const fresh = await signIn(db, "fresh@velora.test", "New User")

    await mkdir("e2e/.auth", { recursive: true })
    // Specs that seed data directly need to know who is signed in.
    await writeFile("e2e/.auth/user.json", JSON.stringify({ userId: zeroAi.userId }))
    await writeFile("e2e/.auth/state.json", JSON.stringify(storageState(zeroAi.sessionToken)))
    await writeFile("e2e/.auth/ai-state.json", JSON.stringify(storageState(ai.sessionToken)))
    await writeFile("e2e/.auth/fresh-state.json", JSON.stringify(storageState(fresh.sessionToken)))
  } finally {
    await client.close()
  }
  return startAiServer()
}

async function signIn(db: Db, email: string, name: string) {
  const userId = new ObjectId()
  const sessionToken = randomUUID()
  await db.collection("users").insertOne({ _id: userId, name, email, emailVerified: null })
  await db.collection("sessions").insertOne({ sessionToken, userId, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) })
  return { userId: userId.toHexString(), sessionToken }
}

function storageState(sessionToken: string) {
  return {
    cookies: [
      {
        // Non-HTTPS origin → unprefixed cookie name.
        name: "authjs.session-token",
        value: sessionToken,
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  }
}
