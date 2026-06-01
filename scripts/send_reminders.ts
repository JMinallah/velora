import { findDueReminders, markReminderSent } from "../src/lib/mongodb/reminders"

async function run() {
  console.log("Starting reminder worker...")
  try {
    const due = await findDueReminders(100)
    console.log(`Found ${due.length} due reminders`)
    for (const r of due) {
      try {
        // TODO: wire real delivery (email/push). For now, simulate send and mark sent.
        console.log(`Sending reminder ${r.id} (${r.channel}) -> ${r.title} due ${r.dueAt}`)
        // In production, call SendGrid/FCM/etc and handle failures/retries.
        await markReminderSent(r.id)
      } catch (err) {
        console.error("Failed sending reminder", r.id, err)
      }
    }
  } catch (err) {
    console.error("Reminder worker failed", err)
    process.exitCode = 1
  }
}

run()
