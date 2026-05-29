import { MongoClient, Db } from "mongodb"

const uri = process.env.MONGODB_URI || ""
const dbName = process.env.MONGODB_DB || "velora_dev"

let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient
  if (!uri) throw new Error("MONGODB_URI is not set")
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  return client
}

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb
  const client = await getClient()
  const db = client.db(dbName)
  cachedDb = db
  return db
}

export async function closeClient() {
  if (cachedClient) {
    await cachedClient.close()
    cachedClient = null
    cachedDb = null
  }
}
