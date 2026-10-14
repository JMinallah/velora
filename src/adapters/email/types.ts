export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
  /**
   * Same key → the provider sends at most once (Resend keeps keys 24 h), so
   * a retry after a crash between "sent" and "recorded as sent" is harmless.
   */
  idempotencyKey: string
}

export interface Mailer {
  /** "resend" or "outbox" — recorded in the dispatch log, never the address. */
  readonly name: string
  /** Resolves with the provider's message id; throws MailerError when the send failed. */
  send(message: EmailMessage): Promise<{ id: string }>
}

export class MailerError extends Error {
  /** False when retrying cannot help (e.g. the address or sender is rejected). */
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "MailerError"
    this.retryable = retryable
  }
}
