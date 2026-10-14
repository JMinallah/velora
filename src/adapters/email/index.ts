import { env } from "@/lib/env"
import { outboxMailer } from "./outbox"
import { resendMailer } from "./resend"
import type { Mailer } from "./types"

export * from "./types"

/**
 * The configured mailer: Resend when its key is set; the local outbox in
 * development; null in production without a key (email reminders are then
 * skipped and say so in the dispatch log — never reported as sent).
 */
export function getMailer(): Mailer | null {
  const e = env()
  if (e.AUTH_RESEND_KEY) return resendMailer(e.AUTH_RESEND_KEY, e.EMAIL_FROM ?? "Velora <onboarding@resend.dev>")
  return process.env.NODE_ENV === "production" ? null : outboxMailer
}
