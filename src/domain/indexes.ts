import type { Db } from "mongodb"
import { COLLECTIONS } from "./collections"

/**
 * Index policy (docs/02-ARCHITECTURE.md §5): every index on user data leads
 * with userId, matching the domain layer's query scoping. Note: createdAt is
 * an ISO string, so retention is a scheduled pruning job (Phase 7), not a
 * Mongo TTL index — TTL only works on Date fields.
 */
export async function ensureIndexes(db: Db) {
  // Sequential on purpose: concurrent createIndex calls contend for the same
  // collection locks and can stall badly on small instances.
  await db.collection(COLLECTIONS.missions).createIndex({ userId: 1, createdAt: -1 })
  await db.collection(COLLECTIONS.missions).createIndex({ userId: 1, id: 1 }, { unique: true })

  await db.collection(COLLECTIONS.tasks).createIndex({ userId: 1, missionId: 1, createdAt: 1 })
  await db.collection(COLLECTIONS.tasks).createIndex({ userId: 1, missionId: 1, id: 1 }, { unique: true })

  await db.collection(COLLECTIONS.events).createIndex({ userId: 1, missionId: 1, createdAt: 1 })

  await db.collection(COLLECTIONS.messages).createIndex({ userId: 1, missionId: 1, createdAt: 1 })

  await db.collection(COLLECTIONS.documents).createIndex({ userId: 1, missionId: 1 })
  await db.collection(COLLECTIONS.documents).createIndex({ userId: 1, id: 1 }, { unique: true })

  await db.collection(COLLECTIONS.reminders).createIndex({ userId: 1, dueAt: 1 })
  // The cron dispatcher queries across users by status + due time.
  await db.collection(COLLECTIONS.reminders).createIndex({ status: 1, dueAt: 1 })
}
