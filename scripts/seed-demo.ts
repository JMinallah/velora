// Fills a database with realistic demo data through the app's own domain
// functions: users (Auth.js records), missions, tasks with due dates (and
// their automatic reminders), dependencies, custom reminders, chat
// messages, document records, settings and the resulting audit events.
// Used for the backup/restore rehearsal (docs/07-BACKUP-RESTORE.md) and
// for trying the app with data in it.
//
//   MONGODB_URI=... MONGODB_DB=velora_demo npm run seed:demo
//
// Refuses to touch a database that already has missions.
import { ObjectId } from "mongodb"
import { randomUUID } from "node:crypto"
import { closeClient, getDb } from "../src/adapters/db"
import { COLLECTIONS } from "../src/domain/collections"
import { createMission } from "../src/domain/missions"
import { createTask, updateTask } from "../src/domain/tasks"
import { createReminder } from "../src/domain/reminders"
import { updateNotificationPreferences } from "../src/domain/preferences"

process.env.AUTH_SECRET ??= "demo-seed-".padEnd(40, "x")
process.env.AUTH_GOOGLE_ID ??= "demo"
process.env.AUTH_GOOGLE_SECRET ??= "demo"

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

const MISSIONS = [
  {
    title: "Move from Nairobi to Berlin",
    overview: "New job in Berlin starting in January.",
    tasks: ["Get the job contract signed", "Apply for the EU Blue Card", "Book the visa appointment", "Find a flat", "Register the address (Anmeldung)", "Open a bank account", "Book flights"],
  },
  {
    title: "Start a master's in Lyon",
    overview: "MSc starting in September; student visa and housing.",
    tasks: ["Accept the admission offer", "Pay the tuition deposit", "Apply for the student visa", "Apply for CROUS housing", "Get health insurance"],
  },
  {
    title: "Switch careers into UX design",
    overview: "Leave accounting, build a portfolio, land a junior role.",
    tasks: ["Finish the UX course", "Build three case studies", "Update the CV", "Apply to ten roles"],
  },
]

async function main() {
  const db = await getDb()
  if ((await db.collection(COLLECTIONS.missions).countDocuments()) > 0) {
    throw new Error(`database "${db.databaseName}" already has missions; seed an empty one`)
  }

  for (const [u, name] of ["Amina Odhiambo", "Kofi Mensah", "Lena Park"].entries()) {
    const _id = new ObjectId()
    const userId = _id.toHexString()
    const email = `demo${u + 1}@velora.example`
    await db.collection("users").insertOne({ _id, name, email, emailVerified: null })
    await db.collection("accounts").insertOne({ userId: _id, type: "oidc", provider: "google", providerAccountId: `demo-${u + 1}` })
    await updateNotificationPreferences(userId, { leadDays: u + 1, timeZone: ["Africa/Nairobi", "Africa/Accra", "Asia/Seoul"][u] })

    for (const [m, spec] of MISSIONS.entries()) {
      if ((u + m) % 3 === 2) continue // not everyone has every mission
      const mission = await createMission(userId, { title: spec.title, overview: spec.overview, targetDate: day(90 + m * 30) })
      let previous: string | undefined
      for (const [t, label] of spec.tasks.entries()) {
        const task = await createTask(userId, mission.id, {
          label,
          dueDate: day(7 + t * 6),
          priority: (["high", "medium", "low"] as const)[t % 3],
          dependsOn: previous && t % 2 === 1 ? [previous] : [],
        })
        previous = task!.id
        if (t === 0) await updateTask(userId, mission.id, task!.id, { completed: true })
      }
      await createReminder(userId, { missionId: mission.id, title: `Check in on "${spec.title}"`, dueAt: `${day(3)}T09:00:00Z` })
      await db.collection(COLLECTIONS.messages).insertMany(
        ["What should I do first?", "Here's what matters most this week…"].map((text, i) => ({
          id: randomUUID(),
          userId,
          missionId: mission.id,
          type: i === 0 ? "user" : "agent",
          text,
          createdAt: new Date(Date.now() + i).toISOString(),
        }))
      )
      await db.collection(COLLECTIONS.documents).insertOne({
        id: randomUUID(),
        userId,
        missionId: mission.id,
        name: "passport.pdf",
        mimeType: "application/pdf",
        storageUrl: `local:${userId}/${mission.id}/demo.pdf`,
        createdAt: new Date().toISOString(),
        extraction: { status: "done", documentType: "passport", title: "Passport", fields: [{ label: "Expiry", value: day(900) }], expiryDate: day(900), verified: true, extractedAt: new Date().toISOString() },
      })
    }
  }

  const counts = Object.fromEntries(
    await Promise.all(
      (await db.listCollections().toArray()).map(async (c) => [c.name, await db.collection(c.name).countDocuments()] as const)
    )
  )
  console.log(JSON.stringify({ database: db.databaseName, counts }, null, 2))
  await closeClient()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await closeClient()
  process.exit(1)
})
