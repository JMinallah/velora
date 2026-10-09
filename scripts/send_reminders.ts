// Manual reminder dispatch for development: claims due reminders exactly the
// way the cron endpoint does (atomic status flip), so running both never
// double-sends. Usage: npm run reminders:run
import { getDb, closeClient } from "../src/adapters/db"
import { COLLECTIONS, type ReminderRecord } from "../src/domain/collections"
import { emitEvent } from "../src/domain/events"

async function main() {
  const db = await getDb()
  const now = new Date().toISOString()

  let processed = 0
  for (;;) {
    const reminder = await db.collection<ReminderRecord>(COLLECTIONS.reminders).findOneAndUpdate(
      { status: "scheduled", dueAt: { $lte: now } },
      { $set: { status: "sent", updatedAt: now } },
      { returnDocument: "after" }
    )
    if (!reminder) break

    console.log(`reminder due: [${reminder.id}] ${reminder.title} (mission ${reminder.missionId})`)
    await emitEvent(reminder.userId, {
      missionId: reminder.missionId,
      type: "reminder-created",
      actor: "system",
      payload: { reminderId: reminder.id, title: reminder.title, details: reminder.details },
    }).catch(() => undefined)
    processed++
  }

  console.log(`processed ${processed} reminder(s)`)
  await closeClient()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
