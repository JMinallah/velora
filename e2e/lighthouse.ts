/**
 * Lighthouse budget (NFR-PERF-3: performance ≥ 80), run in CI after the
 * end-to-end tests: serves the production build already made, signs in with
 * the E2E session, audits the main pages (Lighthouse's default mobile
 * profile, throttled), writes the scores to the job summary, and fails when
 * a page's performance score is below the budget.
 *
 *   npx tsx e2e/lighthouse.ts   (after `npm run build` and an E2E run)
 */
import { spawn, execFileSync } from "node:child_process"
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { chromium } from "@playwright/test"
import { APP_ENV } from "../playwright.config"

const LIGHTHOUSE = "lighthouse@12.6.0"
const PORT = 3200
const BUDGET = 80
const PAGES = [
  { path: "/signin", name: "Sign in" },
  { path: "/", name: "Dashboard" },
  { path: "/settings", name: "Settings" },
  { path: "/documents", name: "Documents" },
]

async function waitFor(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fetch(url).then((r) => r.status < 500).catch(() => false)) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`app did not start: ${url}`)
}

async function main() {
  const base = `http://127.0.0.1:${PORT}`
  const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, ...APP_ENV },
    stdio: "ignore",
    detached: true,
  })
  try {
    await waitFor(base, 60_000)
    // Warm each page once so the audit measures serving, not first-request compilation of caches.
    const token = JSON.parse(readFileSync("e2e/.auth/state.json", "utf8")).cookies[0].value as string
    const headers = { Cookie: `authjs.session-token=${token}` }
    for (const page of PAGES) await fetch(base + page.path, { headers }).catch(() => undefined)

    mkdirSync("lighthouse", { recursive: true })
    const rows: { name: string; path: string; performance: number; accessibility: number; bestPractices: number; lcp: string }[] = []
    for (const page of PAGES) {
      const out = `lighthouse/${page.path === "/" ? "dashboard" : page.path.slice(1)}.json`
      execFileSync(
        "npx",
        [
          "--yes",
          LIGHTHOUSE,
          base + page.path,
          "--quiet",
          "--output=json",
          `--output-path=${out}`,
          "--only-categories=performance,accessibility,best-practices",
          `--extra-headers=${JSON.stringify(headers)}`,
          "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        ],
        { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: ["ignore", "ignore", "inherit"] }
      )
      const report = JSON.parse(readFileSync(out, "utf8"))
      const score = (key: string) => Math.round((report.categories[key]?.score ?? 0) * 100)
      rows.push({
        name: page.name,
        path: page.path,
        performance: score("performance"),
        accessibility: score("accessibility"),
        bestPractices: score("best-practices"),
        lcp: report.audits["largest-contentful-paint"]?.displayValue ?? "—",
      })
    }

    const table = [
      `### Lighthouse (mobile profile; performance budget ≥ ${BUDGET})`,
      "| Page | Performance | Accessibility | Best practices | LCP |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} (\`${r.path}\`) | ${r.performance < BUDGET ? "❌ " : ""}${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.lcp} |`),
    ].join("\n")
    console.log(table)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`)

    const failing = rows.filter((r) => r.performance < BUDGET)
    if (failing.length) {
      console.error(`Performance below ${BUDGET}: ${failing.map((r) => `${r.path} (${r.performance})`).join(", ")}`)
      process.exitCode = 1
    }
  } finally {
    if (server.pid) process.kill(-server.pid, "SIGTERM")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
