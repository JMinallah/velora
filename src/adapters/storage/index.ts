import { env } from "@/lib/env"
import { localStore } from "./local"
import { r2Store } from "./r2"
import { StorageUnavailableError, type DocumentStore } from "./types"

export * from "./types"

/** The configured store: R2 when configured (or requested), local in development; production without R2 refuses. */
export function documentStore(): DocumentStore {
  const e = env()
  const r2Configured = Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET)
  const choice = e.DOCUMENT_STORE ?? (r2Configured ? "r2" : process.env.NODE_ENV === "production" ? null : "local")
  if (choice === "r2") return r2Store
  if (choice === "local") return localStore
  throw new StorageUnavailableError("Document storage is not configured")
}

/** The store a document's bytes live in, from its stored reference ("local:<key>" / "r2:<key>"). */
export function storeFor(ref: string): { store: DocumentStore; key: string } {
  const [kind, ...rest] = ref.split(":")
  const key = rest.join(":")
  if (!key) throw new Error("invalid storage reference")
  if (kind === "r2") return { store: r2Store, key }
  if (kind === "local") return { store: localStore, key }
  throw new Error(`unknown storage reference "${kind}"`)
}
