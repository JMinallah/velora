import { MongoClient, Db } from "mongodb"
import { env } from "@/lib/env"
import { ensureIndexes } from "@/lib/mongodb/indexes"

// Cached across hot reloads in dev and across invocations in serverless.
const globalForDb = globalThis as unknown as {
  _mongoClient?: MongoClient
  _mongoDb?: Db
}

export async function getClient(): Promise<MongoClient> {
  if (globalForDb._mongoClient) return globalForDb._mongoClient
  const client = new MongoClient(env().MONGODB_URI)
  await client.connect()
  globalForDb._mongoClient = client
  return client
}

export async function getDb(): Promise<Db> {
  if (globalForDb._mongoDb) return globalForDb._mongoDb
  const client = await getClient()
  const db = client.db(env().MONGODB_DB)
  await ensureIndexes(db)
  globalForDb._mongoDb = db
  return db
}

export async function closeClient() {
  if (globalForDb._mongoClient) {
    await globalForDb._mongoClient.close()
    globalForDb._mongoClient = undefined
    globalForDb._mongoDb = undefined
  }
}
