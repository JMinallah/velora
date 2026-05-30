import { v4 as uuidv4 } from "uuid"
import { getDb } from "./client"
import { COLLECTIONS } from "./models"
import type { UserRecord } from "./models"

export async function createUser(input: { email: string; name?: string; passwordHash: string; role?: string }): Promise<UserRecord> {
  const db = await getDb()
  const now = new Date().toISOString()
  const user: UserRecord = {
    id: uuidv4(),
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    role: (input.role as UserRecord['role']) ?? 'user',
    createdAt: now,
  }

  await db.collection(COLLECTIONS.users).insertOne(user)
  return user
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const db = await getDb()
  return await db.collection<UserRecord>(COLLECTIONS.users).findOne({ email })
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const db = await getDb()
  return await db.collection<UserRecord>(COLLECTIONS.users).findOne({ id })
}
