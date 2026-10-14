// Runs the reminder dispatcher once — the same code the scheduled endpoint
// runs (src/domain/dispatch.ts), so running both never double-sends.
// In development, emails land in .data/outbox. Usage: npm run reminders:run
import { getMailer } from "../src/adapters/email"
import { closeClient } from "../src/adapters/db"
import { dispatchDueReminders } from "../src/domain/dispatch"
import { env } from "../src/lib/env"

async function main() {
  const summary = await dispatchDueReminders({ mailer: getMailer(), appUrl: env().APP_URL })
  console.log(JSON.stringify(summary, null, 2))
  await closeClient()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
