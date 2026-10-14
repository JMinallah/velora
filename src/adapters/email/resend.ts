import { MailerError, type EmailMessage, type Mailer } from "./types"

const ENDPOINT = "https://api.resend.com/emails"
const TIMEOUT_MS = 10_000

/** Sends through Resend's HTTP API (no SDK: one endpoint, and the fewer dependencies the better). */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    name: "resend",
    async send(message: EmailMessage) {
      let res: Response
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (err) {
        throw new MailerError(`resend unreachable: ${err instanceof Error ? err.name : "error"}`, true)
      }

      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string }
      if (res.ok && body.id) return { id: body.id }
      // 429 and 5xx are worth retrying; other 4xx (bad address, unverified
      // sender, invalid key) fail the same way every time.
      const retryable = res.status === 429 || res.status >= 500
      throw new MailerError(`resend ${res.status}${body.name ? ` ${body.name}` : ""}`, retryable)
    },
  }
}
