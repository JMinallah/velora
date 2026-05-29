import { Db } from "mongodb"
import { COLLECTIONS } from "./models"

export async function ensureIndexes(db: Db) {
  try {
    const retentionDays = Number(process.env.EVENT_RETENTION_DAYS ?? "90")
    const expireAfterSeconds = Number.isFinite(retentionDays) && retentionDays > 0
      ? Math.floor(retentionDays * 24 * 60 * 60)
      : 60 * 60 * 24 * 90

    // events: index by missionId for quick lookup
    await db.collection(COLLECTIONS.events).createIndex({ missionId: 1 })
    await db.collection(COLLECTIONS.events).createIndex({ missionId: 1, createdAt: -1 })
    await db.collection(COLLECTIONS.events).createIndex({ type: 1 })
    await db.collection(COLLECTIONS.events).createIndex({ actor: 1 })

    // TTL: remove events older than EVENT_RETENTION_DAYS (defaults to 90)
    await db.collection(COLLECTIONS.events).createIndex({ createdAt: 1 }, { expireAfterSeconds })
  } catch (err) {
    console.error("Failed to ensure indexes:", err)
  }
}
