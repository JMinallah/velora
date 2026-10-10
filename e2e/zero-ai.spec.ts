import { test, expect, type Page } from "@playwright/test"

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
  await editMission.getByLabel("Status").selectOption("Watch")
  await editMission.getByLabel("Next step").fill("Gather enrolment documents")
  await editMission.getByRole("button", { name: "Save mission" }).click()
  await expect(page.getByText("Next step: Gather enrolment documents")).toBeVisible()
  await expect(page.getByText(/^Watch/)).toBeVisible()

  // Every change is in the activity log
  await open(page, `/mission/${missionId}/events`)
  for (const type of ["mission created", "mission updated", "task created", "task updated", "task deleted"]) {
    await expect(page.locator("p").filter({ hasText: new RegExp(`^${type}$`) }).first()).toBeVisible()
  }

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
