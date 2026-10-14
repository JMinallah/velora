// Prints a fingerprint of a database: per collection, the document count,
// a SHA-256 over every document (canonical Extended JSON, ordered by _id)
// and the index keys. Two databases with equal fingerprints hold the same
// data, byte for byte — how the restore rehearsal proves a restore is exact.
//
//   npx tsx scripts/db-fingerprint.ts <mongodb-uri> <database>
import { createHash } from "node:crypto"
import { BSON, MongoClient } from "mongodb"

async function main() {
  const [uri, dbName] = process.argv.slice(2)
  if (!uri || !dbName) throw new Error("usage: db-fingerprint <mongodb-uri> <database>")
  const client = await new MongoClient(uri).connect()
  try {
    const db = client.db(dbName)
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith("system.")).sort()
    const result: Record<string, { count: number; sha256: string; indexes: string[] }> = {}
    for (const name of names) {
      const hash = createHash("sha256")
      let count = 0
      for await (const doc of db.collection(name).find({}).sort({ _id: 1 })) {
        hash.update(BSON.EJSON.stringify(doc, { relaxed: false }))
        hash.update("\n")
        count++
      }
      const indexes = (await db.collection(name).indexes()).map((i) => JSON.stringify(i.key) + (i.unique ? " unique" : "")).sort()
      result[name] = { count, sha256: hash.digest("hex"), indexes }
    }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
