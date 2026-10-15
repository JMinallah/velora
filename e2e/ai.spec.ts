import { test, expect, type Page } from "@playwright/test"
import { AI_BASE_URL } from "../playwright.config"

/**
 * The AI-assisted core flows (delivery plan 7-6), end to end in a real
 * browser against a production build: the app has AI on and talks to
 * e2e/fake-gemini.mjs through the real SDK, so everything is exercised
 * except the model's judgement (that's what the eval suite measures).
 */
test.use({ baseURL: AI_BASE_URL, storageState: "e2e/.auth/ai-state.json" })

async function open(page: Page, path: string) {
  await page.goto(path)
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" })
}

async function newMission(page: Page, title: string): Promise<string> {
  const res = await page.request.post("/api/missions", { data: { title } })
  expect(res.status()).toBe(201)
  return (await res.json()).data.id
}

async function send(page: Page, message: string) {
  await page.getByPlaceholder(/Ask about deadlines/).fill(message)
  await page.getByRole("button", { name: "Send" }).click()
}

const tasksOf = async (page: Page, missionId: string) =>
  (await (await page.request.get(`/api/missions/${missionId}/tasks`)).json()).data as { id: string; label: string; source: string }[]

test("agent chat: a request becomes a real task, with a receipt, an agent label and an undo", async ({ page }) => {
  const missionId = await newMission(page, "Move to Lisbon")
  await open(page, `/mission/${missionId}`)
  await expect(page.getByRole("status", { name: "AI status" })).toHaveCount(0) // AI is on: no banner

  await send(page, "Please add a task to book the movers on 2026-12-01")
  await expect(page.getByText('Created task "Book the movers" — due 2026-12-01')).toBeVisible()
  await expect(page.getByText('Done — "Book the movers" is on your list for 2026-12-01.')).toBeVisible()
  await expect(page.getByRole("list", { name: "Tasks" }).getByText("Book the movers")).toBeVisible()
  await expect(page.getByText(/AI today: \d+ of 50/)).toBeVisible()

  const [task] = await tasksOf(page, missionId)
  expect(task).toMatchObject({ label: "Book the movers", source: "agent" })

  // The agent's change can be undone in one click.
  const undo = page.getByLabel("Undo Velora's last change")
  await expect(undo).toContainText('Created task "Book the movers"')
  await undo.getByRole("button", { name: "Undo" }).click()
  await expect.poll(() => tasksOf(page, missionId)).toEqual([])
})

test("deleting is only ever proposed: nothing changes until the user confirms the card", async ({ page }) => {
  const missionId = await newMission(page, "Start university in Lyon")
  await page.request.post(`/api/missions/${missionId}/tasks`, { data: { label: "Old housing application" } })
  await open(page, `/mission/${missionId}`)

  await send(page, "Please delete the task Old housing application")
  const card = page.getByRole("group", { name: "Confirm action" })
  await expect(card).toContainText("Old housing application")
  await expect(card).toContainText("Nothing changes unless you confirm")
  expect((await tasksOf(page, missionId)).map((t) => t.label)).toEqual(["Old housing application"])

  await card.getByRole("button", { name: "Confirm" }).click()
  await expect(card.getByRole("status")).toBeVisible()
  await expect.poll(async () => (await tasksOf(page, missionId)).length).toBe(0)
})

test("a document is read on upload; its details stay unverified until the user confirms them", async ({ page }) => {
  const missionId = await newMission(page, "Move to Kigali")
  await open(page, "/documents")
  await page.getByRole("combobox").selectOption(missionId)
  // Nothing is sent to the AI until the user allows it (explicit, revocable consent).
  const allow = page.getByLabel("Let Velora's AI read my documents")
  await expect(allow).not.toBeChecked()
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/consent") && r.request().method() === "POST" && r.ok()),
    allow.check(),
  ])

  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
    "hex"
  )
  await page.getByLabel("Upload documents").setInputFiles({ name: "my-passport.png", mimeType: "image/png", buffer: png })
  const details = page.getByLabel("Details of my-passport.png")
  await expect(details).toContainText("Republic of Kenya Passport", { timeout: 30_000 })
  await expect(details).toContainText("AI-extracted · unverified")
  await expect(details).toContainText("AK7654321")
  await expect(details.getByRole("button", { name: "Add reminder" })).toHaveCount(0)

  await details.getByRole("button", { name: "These are correct" }).click()
  await expect(details).toContainText("Confirmed by you")
  await details.getByRole("button", { name: "Add reminder" }).click()
  await expect(details).toContainText(/Reminder set for/)
})

test("onboarding: Velora drafts a plan; nothing exists until the user accepts it", async ({ page }) => {
  const before = ((await (await page.request.get("/api/missions")).json()).data as unknown[]).length
  await open(page, "/onboarding")
  await page.getByLabel("What are you planning?").fill("Moving from Nairobi to Lisbon for a new job")
  await page.getByRole("button", { name: "Draft my plan" }).click()

  await expect(page).toHaveURL(/\/plan\/[0-9a-f-]{36}$/)
  await expect(page.getByLabel("Mission title")).toHaveValue("Move from Nairobi to Lisbon")
  await expect(page.getByLabel("Task: Apply for the residence visa")).toBeVisible()
  expect(((await (await page.request.get("/api/missions")).json()).data as unknown[]).length).toBe(before)

  await page.getByRole("button", { name: "Accept plan" }).click()
  await expect(page).toHaveURL(/\/mission\/[0-9a-f-]{36}$/)
  const missionId = page.url().split("/").pop()!
  const tasks = await tasksOf(page, missionId)
  expect(tasks).toHaveLength(8)
  expect(tasks.every((t) => t.source === "agent")).toBe(true)
})

test("the ops page is shown to an admin", async ({ page }) => {
  await open(page, "/ops")
  await expect(page.getByRole("heading", { level: 1, name: "Operations" })).toBeVisible()
  await expect(page.getByRole("region", { name: "AI today" })).toContainText("available")
  await expect(page.getByRole("region", { name: "Last 24 hours" })).toContainText("Model calls")
})
