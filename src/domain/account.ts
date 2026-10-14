import { ObjectId } from "mongodb"
import { getDb } from "@/adapters/db"
import { documentStore, StorageUnavailableError, type DocumentStore } from "@/adapters/storage"
import { localStore } from "@/adapters/storage/local"
import { r2Store } from "@/adapters/storage/r2"
import { COLLECTIONS } from "./collections"
import { errorFields, log } from "@/lib/log"

/**
 * Account deletion and export (FR-AUTH-3, FR-AUTH-4; 04-SECURITY §6).
 *
 * Every collection holding a user's data is listed here once, so deletion
 * and export can't drift apart; the account test asserts that nothing with
 * the user's id survives in *any* collection, so a new collection that
 * isn't added here fails it.
 */
const USER_COLLECTIONS = [
  COLLECTIONS.missions,
  COLLECTIONS.tasks,
  COLLECTIONS.messages,
  COLLECTIONS.reminders,
  COLLECTIONS.reminderDispatches,
  COLLECTIONS.documents,
  COLLECTIONS.uploads,
  COLLECTIONS.events,
  COLLECTIONS.pendingActions,
  COLLECTIONS.planProposals,
  COLLECTIONS.replanProposals,
  COLLECTIONS.userSettings,
] as const

/** Auth.js's collections (MongoDB adapter): ids are ObjectIds, not the string userId. */
const AUTH = { users: COLLECTIONS.users, accounts: "accounts", sessions: "sessions", verificationTokens: "verification_tokens" }

const authId = (userId: string) => (ObjectId.isValid(userId) && userId.length === 24 ? new ObjectId(userId) : null)

export class AccountFilesError extends Error {}

export { DELETE_ACCOUNT_PHRASE } from "./account-phrase"

/**
 * Hard-deletes the account. Order matters:
 * 1. stored files — if storage refuses, stop before deleting anything else,
 *    so a retry still finds the records pointing at the files;
 * 2. sessions — access ends now, whatever happens next;
 * 3. every row the user owns, then the Auth.js identity.
 * Safe to retry: each step is idempotent.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = await getDb()

  // 1. Files: everything under the user's prefix, in every store they used.
  const kinds = new Set<DocumentStore["kind"]>()
  const docs = await db
    .collection<{ storageUrl?: string }>(COLLECTIONS.documents)
    .find({ userId }, { projection: { storageUrl: 1 } })
    .toArray()
  const pending = await db.collection<{ store: string }>(COLLECTIONS.uploads).find({ userId }, { projection: { store: 1 } }).toArray()
  for (const ref of [...docs.map((d) => d.storageUrl?.split(":")[0]), ...pending.map((u) => u.store)]) {
    if (ref === "local" || ref === "r2") kinds.add(ref)
  }
  try {
    kinds.add(documentStore().kind) // in case a file outlived its record
  } catch (err) {
    if (!(err instanceof StorageUnavailableError)) throw err
  }
  try {
    for (const kind of kinds) await (kind === "r2" ? r2Store : localStore).deletePrefix(userId)
  } catch (err) {
    log.error("account_deletion_files_failed", errorFields(err))
    throw new AccountFilesError("Couldn't delete your stored files")
  }

  // 2. Sessions first: from here on the user is signed out everywhere.
  const id = authId(userId)
  if (id) await db.collection(AUTH.sessions).deleteMany({ userId: id })

  // 3. Data, then identity.
  await Promise.all(USER_COLLECTIONS.map((name) => db.collection(name).deleteMany({ userId })))
  const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  await db.collection(COLLECTIONS.rateLimits).deleteMany({ _id: { $regex: `:${escaped}:` } } as never)
  if (id) {
    const user = await db.collection<{ email?: string }>(AUTH.users).findOne({ _id: id }, { projection: { email: 1 } })
    await db.collection(AUTH.accounts).deleteMany({ userId: id })
    if (user?.email) await db.collection(AUTH.verificationTokens).deleteMany({ identifier: user.email })
    await db.collection(AUTH.users).deleteOne({ _id: id })
  }
  log.info("account_deleted", { userId })
}

export type AccountExport = {
  format: "velora-export"
  version: 1
  exportedAt: string
  account: { email: string | null; name: string | null; createdVia: string[] }
  notes: string[]
} & Record<(typeof USER_COLLECTIONS)[number], unknown[]>

/**
 * Everything stored about the user, as JSON (FR-AUTH-4). Document files
 * themselves aren't embedded — each document entry is listed, and its file
 * can be downloaded from the app.
 */
export async function exportAccount(userId: string): Promise<AccountExport> {
  const db = await getDb()
  const id = authId(userId)
  const [user, accounts, ...rows] = await Promise.all([
    id ? db.collection<{ email?: string; name?: string }>(AUTH.users).findOne({ _id: id }) : null,
    id ? db.collection<{ provider: string }>(AUTH.accounts).find({ userId: id }, { projection: { provider: 1 } }).toArray() : [],
    ...USER_COLLECTIONS.map((name) =>
      db.collection(name).find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray()
    ),
  ])
  return {
    format: "velora-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { email: user?.email ?? null, name: user?.name ?? null, createdVia: accounts.map((a) => a.provider) },
    notes: [
      "Dates are ISO 8601 in UTC.",
      "Document files are not embedded; open each document in Velora to download it.",
    ],
    ...(Object.fromEntries(USER_COLLECTIONS.map((name, i) => [name, rows[i]])) as Record<(typeof USER_COLLECTIONS)[number], unknown[]>),
  }
}
