import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"
import { E2E_DB } from "../playwright.config"

/** Waits for React to hydrate; typing into server-rendered inputs before then is lost. */
async function open(page: Page, path: string) {
  await page.goto(path)
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" })
}

/**
 * Phase 2.5 exit gate: with AI disabled, a user can run a whole mission
 * by hand (docs/06-DELIVERY-PLAN.md).
 */
test("creates a mission by hand and lands on it", async ({ page }) => {
  await open(page, "/mission/new")
  await page.getByLabel("Mission title").fill("Move from Nairobi to Seoul")
  await page.getByLabel(/What.s changing/).fill("New job starting in October")
  await page.getByLabel(/Target date/).fill("2026-12-01")
  await page.getByRole("button", { name: "Create mission" }).click()

  await expect(page).toHaveURL(/\/mission\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { level: 1, name: "Move from Nairobi to Seoul" })).toBeVisible()
  await expect(page.getByText("Target date: Dec 1, 2026")).toBeVisible()
})

test("runs a whole mission by hand: tasks, edits, deletes, activity log", async ({ page }) => {
  await open(page, "/mission/new")
  await page.getByLabel("Mission title").fill("Start university in Lyon")
  await page.getByRole("button", { name: "Create mission" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Start university in Lyon" })).toBeVisible()
  const missionUrl = page.url()
  const missionId = missionUrl.split("/").pop()!

  const addTask = page.getByRole("form", { name: "Add task" })
  const tasks = page.getByRole("list", { name: "Tasks" })

  // Add a task with a due date and priority
  await addTask.getByLabel("New task").fill("Apply for student visa")
  await addTask.getByLabel("Due date").fill("2026-11-15")
  await addTask.getByLabel("Priority").selectOption("high")
  await addTask.getByRole("button", { name: "Add" }).click()
  await expect(tasks.getByText("Apply for student visa")).toBeVisible()
  await expect(tasks.getByText("General · high · Due Nov 15, 2026")).toBeVisible()

  // Complete it
  await page.getByLabel("Done: Apply for student visa").check()
  await expect(page.getByLabel("Done: Apply for student visa")).toBeChecked()

  // Edit it
  await page.getByRole("button", { name: 'Edit "Apply for student visa"' }).click()
  const editTask = page.getByRole("form", { name: 'Edit "Apply for student visa"' })
  await editTask.getByLabel("Task").fill("Apply for long-stay student visa")
  await editTask.getByLabel("Category").fill("Visa")
  await editTask.getByRole("button", { name: "Save task" }).click()
  await expect(tasks.getByText("Apply for long-stay student visa")).toBeVisible()
  await expect(tasks.getByText(/^Visa · high · Due Nov 15, 2026/)).toBeVisible()

  // Add and delete a second task
  await addTask.getByLabel("New task").fill("Book flights")
  await addTask.getByRole("button", { name: "Add" }).click()
  await expect(tasks.getByText("Book flights")).toBeVisible()
  await page.getByRole("button", { name: 'Delete "Book flights"' }).click()
  await tasks.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(tasks.getByText("Book flights")).toHaveCount(0)

  // Edit the mission
  await page.getByRole("button", { name: "Edit mission" }).click()
  const editMission = page.getByRole("form", { name: "Edit mission" })
  await editMission.getByLabel("Next step").fill("Gather enrolment documents")
  await editMission.getByRole("button", { name: "Save mission" }).click()
  await expect(page.getByText("Next step: Gather enrolment documents")).toBeVisible()

  // Every change is in the activity log
  await open(page, `/mission/${missionId}/events`)
  for (const type of ["mission created", "mission updated", "task created", "task updated", "task deleted"]) {
    await expect(page.locator("p").filter({ hasText: new RegExp(`^${type}$`) }).first()).toBeVisible()
  }
  // Every change here was the user's own: labelled "You", never "Velora" (3-6).
  const activity = page.getByRole("list", { name: "Activity" })
  await expect(activity.getByText("You", { exact: true }).first()).toBeVisible()
  await expect(activity.getByText("Velora", { exact: true })).toHaveCount(0)

  // Delete the mission
  await open(page, missionUrl.replace(/^https?:\/\/[^/]+/, ""))
  await page.getByRole("button", { name: "Delete mission" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete mission" }).click()
  await expect(page).not.toHaveURL(missionUrl)
  const missions = (await (await page.request.get("/api/missions")).json()).data as { id: string }[]
  expect(missions.map((m) => m.id)).not.toContain(missionId)
})

test("dashboard shows missions with progress and upcoming deadlines", async ({ page }) => {
  const api = page.request
  const mission = (await (await api.post("/api/missions", { data: { title: "Relocate to Accra", targetDate: "2027-03-01" } })).json()).data
  const tasksUrl = `/api/missions/${mission.id}/tasks`
  await api.post(tasksUrl, { data: { label: "Ship household goods", dueDate: "2027-02-01" } })
  const done = (await (await api.post(tasksUrl, { data: { label: "Get quotes" } })).json()).data
  await api.patch(`${tasksUrl}/${done.id}`, { data: { completed: true } })

  await open(page, "/")
  await expect(page.getByRole("heading", { level: 1, name: "Your missions" })).toBeVisible()

  const card = page.getByRole("list", { name: "Missions" }).getByRole("link", { name: /Relocate to Accra/ })
  await expect(card).toContainText("1 of 2 tasks done")
  await expect(card).toContainText("Mar 1, 2027")

  const upcoming = page.getByRole("list", { name: "Upcoming tasks" })
  await expect(upcoming.getByRole("link", { name: /Ship household goods/ })).toContainText("Relocate to Accra")
  await expect(upcoming.getByText("Get quotes")).toHaveCount(0) // completed tasks are not upcoming

  await card.click()
  await expect(page.getByRole("heading", { level: 1, name: "Relocate to Accra" })).toBeVisible()
})

test("asking Velora to confirm every change is one click; loosening it explains first", async ({ page }) => {
  await open(page, "/mission/new")
  await page.getByLabel("Mission title").fill("Move to Lisbon")
  await page.getByRole("button", { name: "Create mission" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Move to Lisbon" })).toBeVisible()

  const permissions = page.getByLabel("Velora's permissions")
  await expect(permissions).toContainText("Velora makes changes directly")
  await permissions.getByRole("button", { name: "Ask me before every change" }).click()
  await expect(permissions).toContainText("Velora asks before every change it makes.")

  await permissions.getByRole("button", { name: "Let Velora make changes directly" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Deleting anything will always need your confirmation")
  await dialog.getByRole("button", { name: "Keep asking me" }).click()
  await expect(permissions).toContainText("Velora asks before every change it makes.")

  await permissions.getByRole("button", { name: "Let Velora make changes directly" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Make changes directly" }).click()
  await expect(permissions).toContainText("Velora makes changes directly")

  // Persisted, not just local state.
  await open(page, page.url().replace(/^https?:\/\/[^/]+/, ""))
  await expect(page.getByLabel("Velora's permissions")).toContainText("Velora makes changes directly")
})

test("a task can wait on another; it shows what it's waiting on until that is done", async ({ page }) => {
  await open(page, "/mission/new")
  await page.getByLabel("Mission title").fill("Move to Nairobi")
  await page.getByRole("button", { name: "Create mission" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Move to Nairobi" })).toBeVisible()

  const addTask = page.getByRole("form", { name: "Add task" })
  const tasks = page.getByRole("list", { name: "Tasks" })
  for (const label of ["Sign lease", "Book movers"]) {
    await addTask.getByLabel("New task").fill(label)
    await addTask.getByRole("button", { name: "Add" }).click()
    await expect(tasks.getByText(label, { exact: true })).toBeVisible()
  }

  await page.getByRole("button", { name: 'Edit "Book movers"' }).click()
  const edit = page.getByRole("form", { name: 'Edit "Book movers"' })
  await edit.getByRole("checkbox", { name: "Sign lease" }).check()
  await edit.getByRole("button", { name: "Save task" }).click()
  await expect(tasks.getByText("Waiting on: Sign lease")).toBeVisible()

  await page.getByLabel("Done: Sign lease").check()
  await expect(tasks.getByText("After: Sign lease")).toBeVisible()
  await expect(tasks.getByText("Waiting on: Sign lease")).toHaveCount(0)
})

test("onboarding without AI explains and offers to plan by hand", async ({ page }) => {
  await open(page, "/onboarding")
  await page.getByLabel("What are you planning?").fill("Start university in Lyon")
  await page.getByRole("button", { name: "Draft my plan" }).click()
  // Filter by text: Next.js renders its own (empty) role="alert" route announcer.
  const problem = page.getByRole("alert").filter({ hasText: "AI planning is not available right now" })
  await expect(problem).toBeVisible()
  await problem.getByRole("link", { name: "Create it manually instead" }).click()
  await expect(page.getByLabel("Mission title")).toHaveValue("Start university in Lyon")
})

test("a drafted plan is reviewed, edited and accepted into a mission", async ({ page }) => {
  // Drafting needs the model, which E2E runs without — seed the proposal directly.
  const { userId } = JSON.parse(readFileSync("e2e/.auth/user.json", "utf8"))
  const id = randomUUID()
  const client = await new MongoClient(process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017").connect()
  await client.db(E2E_DB).collection("plan_proposals").insertOne({
    id,
    userId,
    status: "proposed",
    createdAt: new Date().toISOString(),
    promptVersion: "planner.v1",
    model: "seeded",
    attempts: 1,
    request: { goal: "Move to Toronto" },
    plan: {
      title: "Move to Toronto",
      summary: "Relocating for a master's programme",
      targetDate: null,
      phases: [
        {
          name: "Paperwork",
          tasks: [
            { key: "permit", label: "Check study permit requirements", dependsOn: [], rationale: "Rules change often" },
            { key: "apply", label: "Apply for study permit", dependsOn: ["permit"] },
          ],
        },
        { name: "Arrival", tasks: [{ key: "sim", label: "Buy a local SIM card", dependsOn: [] }] },
      ],
    },
  })
  await client.close()

  // The dashboard lists it as awaiting review.
  await open(page, "/")
  await page.getByRole("list", { name: "Draft plans" }).getByRole("link", { name: /Move to Toronto/ }).click()
  await expect(page.getByText("Nothing is saved until you accept")).toBeVisible()
  await expect(page.getByText("3 tasks in 2 phases")).toBeVisible()
  await expect(page.getByText("After: Check study permit requirements")).toBeVisible()

  await page.getByLabel("Task: Apply for study permit").fill("Apply for study permit online")
  await page.getByRole("button", { name: 'Remove "Buy a local SIM card"' }).click()
  await expect(page.getByText("2 tasks in 1 phase")).toBeVisible()

  await page.getByRole("button", { name: "Accept plan" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Move to Toronto" })).toBeVisible()
  const tasks = page.getByRole("list", { name: "Tasks" })
  await expect(tasks.getByText("Apply for study permit online")).toBeVisible()
  await expect(tasks.getByText("Waiting on: Check study permit requirements")).toBeVisible()
  await expect(tasks.getByText("Buy a local SIM card")).toHaveCount(0)
})

test("the risk indicator explains itself and updates as tasks change", async ({ page }) => {
  await open(page, "/mission/new")
  await page.getByLabel("Mission title").fill("Move to Accra")
  await page.getByRole("button", { name: "Create mission" }).click()
  const risk = page.getByLabel("Mission risk")
  await expect(risk).toContainText("On track")

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const addTask = page.getByRole("form", { name: "Add task" })
  await addTask.getByLabel("New task").fill("Renew passport")
  await addTask.getByLabel("Due date").fill(yesterday)
  await addTask.getByRole("button", { name: "Add" }).click()

  await expect(risk).toContainText("At risk")
  await expect(page.getByText('"Renew passport" is 1 day overdue.')).toBeVisible()

  await page.getByLabel("Done: Renew passport").check()
  await expect(risk).toContainText("On track")

  // The toggle saves in the background; wait for the save before leaving the page
  // (listen first, so a fast response can't slip past).
  const saved = page.waitForResponse((r) => r.url().includes("/tasks/") && r.request().method() === "PATCH")
  await page.getByLabel("Done: Renew passport").uncheck()
  await saved
  await expect(risk).toContainText("At risk")
  await open(page, "/")
  await expect(page.getByRole("list", { name: "Missions" }).getByRole("link", { name: /Move to Accra/ })).toContainText("At risk")
})

test("a document uploads privately and opens through a short-lived link", async ({ page }) => {
  const mission = (await (await page.request.post("/api/missions", { data: { title: "Move to Kigali" } })).json()).data
  await open(page, "/documents")
  await page.getByRole("combobox").selectOption(mission.id)

  // A tiny valid PNG (1×1).
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
    "hex"
  )
  await page.getByLabel("Upload documents").setInputFiles({ name: "passport.png", mimeType: "image/png", buffer: png })
  await expect(page.getByRole("list", { name: "Upload status" })).toContainText("passport.png: uploaded ✓")
  const documents = page.getByRole("list", { name: "Documents" })
  await expect(documents.getByText("passport.png")).toBeVisible()

  const [viewer] = await Promise.all([
    page.waitForEvent("popup"),
    documents.getByRole("button", { name: 'View "passport.png"' }).click(),
  ])
  const response = await viewer.waitForLoadState().then(() => viewer.evaluate(() => fetch(location.href).then((r) => [r.status, r.headers.get("content-type")])))
  expect(response).toEqual([200, "image/png"])
  await viewer.close()

  await documents.getByRole("button", { name: 'Delete "passport.png"' }).click()
  await documents.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(documents.getByText("passport.png")).toHaveCount(0)
})
