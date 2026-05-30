import fs from "fs"
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "velora_dev"

if (!uri) {
  console.error("Please set MONGODB_URI in environment before running this script.")
  process.exit(1)
}

async function main() {
  const raw = fs.readFileSync(new URL("./missionSeeds.json", import.meta.url))
  const json = JSON.parse(raw.toString())

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)

  for (const m of json.missions) {
    const now = new Date().toISOString()
    const mission = {
      id: m.id,
      title: m.title,
      subtitle: m.subtitle,
      phase: m.phase,
      status: m.status,
      overview: m.overview,
      nextStep: m.nextStep,
      createdAt: now,
      updatedAt: now,
      source: "onboarding",
    }

    await db.collection("missions").updateOne({ id: mission.id }, { $set: mission }, { upsert: true })

    // tasks
    if (m.tasks) {
      for (const [category, tasks] of Object.entries(m.tasks)) {
        for (const t of tasks) {
          const task = {
            id: t.id,
            missionId: mission.id,
            category,
            label: t.label,
            completed: !!t.completed,
            dueDate: t.dueDate ?? null,
            priority: "medium",
            source: "import",
            createdAt: now,
            updatedAt: now,
          }

          await db.collection("tasks").updateOne({ id: task.id }, { $set: task }, { upsert: true })
        }
      }
    }
  }

  console.log("Seed complete")
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
