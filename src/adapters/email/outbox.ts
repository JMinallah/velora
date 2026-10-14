import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { EmailMessage, Mailer } from "./types"

/** Development emails land here (gitignored with the rest of .data/). */
export const OUTBOX_DIR = path.join(process.cwd(), ".data", "outbox")

/**
 * Development transport: writes each email to .data/outbox as JSON instead
 * of sending it, so reminders can be tried locally with no email account.
 * The file name derives from the idempotency key, so a repeated send
 * overwrites rather than duplicates — the same guarantee Resend gives.
 */
export const outboxMailer: Mailer = {
  name: "outbox",
  async send(message: EmailMessage) {
    const id = createHash("sha256").update(message.idempotencyKey).digest("hex").slice(0, 24)
    await mkdir(OUTBOX_DIR, { recursive: true })
    await writeFile(
      path.join(OUTBOX_DIR, `${id}.json`),
      JSON.stringify({ ...message, writtenAt: new Date().toISOString() }, null, 2)
    )
    console.info(`[outbox] "${message.subject}" → .data/outbox/${id}.json`)
    return { id: `outbox-${id}` }
  },
}
