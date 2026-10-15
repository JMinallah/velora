import { spawn, type ChildProcess } from "node:child_process"
import { AI_PORT, APP_ENV, FAKE_GEMINI_PORT } from "../playwright.config"

async function up(url: string): Promise<boolean> {
  return fetch(url).then((r) => r.status < 500).catch(() => false)
}

async function waitFor(url: string, what: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await up(url)) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`${what} did not start within ${timeoutMs / 1000}s (${url})`)
}

/**
 * Starts the fake Gemini and a second app server (AI on, pointed at the
 * fake) from the build the main web server just made. Reuses either if it's
 * already running locally. Returns a function that stops what it started.
 */
export async function startAiServer(): Promise<() => Promise<void>> {
  const started: ChildProcess[] = []
  const launch = (cmd: string, args: string[], env: Record<string, string>) => {
    // Own process group, so teardown stops the whole tree.
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"], detached: true })
    started.push(child)
  }

  const fakeUrl = `http://127.0.0.1:${FAKE_GEMINI_PORT}`
  if (!(await up(`${fakeUrl}/health`))) launch(process.execPath, ["e2e/fake-gemini.mjs", String(FAKE_GEMINI_PORT)], {})
  await waitFor(`${fakeUrl}/health`, "fake Gemini", 15_000)

  const appUrl = `http://127.0.0.1:${AI_PORT}`
  if (!(await up(appUrl))) {
    launch("node_modules/.bin/next", ["start", "-p", String(AI_PORT)], {
      ...APP_ENV,
      GEMINI_API_KEY: "fake-key",
      GEMINI_TIER: "paid", // production build: AI runs only on the paid tier
      GEMINI_BASE_URL: fakeUrl,
      ADMIN_EMAILS: "ai@velora.test",
    })
  }
  await waitFor(appUrl, "AI app server", 120_000)

  return async () => {
    for (const child of started) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM")
      } catch {
        // already gone
      }
    }
  }
}
