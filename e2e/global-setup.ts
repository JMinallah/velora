import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { MongoClient, ObjectId } from "mongodb"
import { E2E_DB } from "../playwright.config"

/**
 * Starts every run from an empty database and signs a test user in by
 * writing the same user + session documents the Auth.js MongoDB adapter
 * creates after a real Google sign-in, then storing the session cookie.
 */
export default async function globalSetup() {
  const uri = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017"
  const client = await new MongoClient(uri).connect()
  try {
    const db = client.db(E2E_DB)
    await db.dropDatabase()

    const userId = new ObjectId()
    const sessionToken = randomUUID()
    await db.collection("users").insertOne({
      _id: userId,
      name: "E2E User",
      email: "e2e@velora.test",
      emailVerified: null,
    })
    await db.collection("sessions").insertOne({
      sessionToken,
      userId,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await mkdir("e2e/.auth", { recursive: true })
    await writeFile(
      "e2e/.auth/state.json",
      JSON.stringify({
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
            sameSite: "Lax",
          },
        ],
        origins: [],
      })
    )
  } finally {
    await client.close()
  }
}
