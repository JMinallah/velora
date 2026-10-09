import { MongoClient, Db } from "mongodb"
import { env } from "@/lib/env"
import { ensureIndexes } from "@/domain/indexes"

// Cached across hot reloads in dev and across invocations in serverless.
// The *promises* are cached, not the resolved values, so concurrent cold-start
// requests share one connection instead of each opening their own.
const globalForDb = globalThis as unknown as {
  _mongoClient?: Promise<MongoClient>
  _mongoDb?: Promise<Db>
}

export function getClient(): Promise<MongoClient> {
  if (!globalForDb._mongoClient) {
    globalForDb._mongoClient = new MongoClient(env().MONGODB_URI).connect().catch((err) => {
      globalForDb._mongoClient = undefined // let the next request retry
      throw err
    })
  }
  return globalForDb._mongoClient
}

export function getDb(): Promise<Db> {
  if (!globalForDb._mongoDb) {
    globalForDb._mongoDb = (async () => {
      const db = (await getClient()).db(env().MONGODB_DB)
      await ensureIndexes(db)
      return db
    })().catch((err) => {
      globalForDb._mongoDb = undefined
      throw err
    })
  }
  return globalForDb._mongoDb
}

export async function closeClient() {
  const pending = globalForDb._mongoClient
  globalForDb._mongoClient = undefined
  globalForDb._mongoDb = undefined
  if (pending) await (await pending).close()
}
