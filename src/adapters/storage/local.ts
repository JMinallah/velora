import fs from "node:fs"
import path from "node:path"
import { signGrant } from "./signed"
import { assertSafePrefix, UPLOAD_URL_TTL_SECONDS, VIEW_URL_TTL_SECONDS, type DocumentStore } from "./types"

/** Files under .data/uploads (gitignored, outside public/). URLs go through /api/files/[token]. */
export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), ".data", "uploads")

/** Resolves a key inside the store, refusing anything that would escape it. */
export function localPath(key: string): string {
  const file = path.resolve(LOCAL_UPLOAD_DIR, key)
  if (!file.startsWith(LOCAL_UPLOAD_DIR + path.sep)) throw new Error("invalid storage key")
  return file
}

const meta = (file: string) => `${file}.meta.json`
const nowSeconds = () => Math.floor(Date.now() / 1000)

export const localStore: DocumentStore = {
  kind: "local",
  async createUploadUrl(key, { contentType, maxBytes }) {
    const exp = nowSeconds() + UPLOAD_URL_TTL_SECONDS
    return {
      url: `/api/files/${signGrant({ op: "put", key, contentType, maxBytes, exp })}`,
      headers: { "Content-Type": contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  },
  async head(key) {
    try {
      const file = localPath(key)
      const stat = await fs.promises.stat(file)
      const { contentType } = JSON.parse(await fs.promises.readFile(meta(file), "utf8"))
      return { size: stat.size, contentType }
    } catch {
      return null
    }
  },
  async createViewUrl(key, { filename, contentType }) {
    const exp = nowSeconds() + VIEW_URL_TTL_SECONDS
    return {
      url: `/api/files/${signGrant({ op: "get", key, contentType, filename, exp })}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  },
  async read(key) {
    return fs.promises.readFile(localPath(key))
  },
  async delete(key) {
    const file = localPath(key)
    await fs.promises.rm(file, { force: true })
    await fs.promises.rm(meta(file), { force: true })
  },
  async deletePrefix(prefix) {
    assertSafePrefix(prefix)
    await fs.promises.rm(localPath(prefix), { recursive: true, force: true })
  },
}

/** Writes an object (called by the PUT /api/files route after the grant is verified). */
export async function writeLocalObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  const file = localPath(key)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, bytes)
  await fs.promises.writeFile(meta(file), JSON.stringify({ contentType }))
}
