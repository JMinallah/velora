/**
 * Agent eval harness (docs/03-AGENT-DESIGN.md §7): tool-selection fixtures
 * run against the REAL Gemini provider and a REAL MongoDB, because evals
 * exist to catch prompt/model regressions that mocks cannot.
 *
 * Requirements (skips with exit 0 and a visible notice when missing):
 *   GEMINI_API_KEY      — Gemini free tier is enough; fixtures are few
 *   TEST_MONGODB_URI    — local: podman start velora-test-mongo; CI: service
 *   EVAL_MIN_INTERVAL_MS (optional) — spacing between model calls; the
 *                         default suits Flash-Lite's free 15 requests/minute
 *                         (use 13000 for a 5/minute model).
 *                         Set 0 on a paid key.
 *
 * Sets live in evals/sets/ (tool-selection, injection, regression).
 * Usage: npm run evals                  (all sets)
 *        npm run evals -- --set injection (one set)
 * Exit code 1 on any failed fixture — CI treats this as merge-blocking.
 * A fixture that cannot run because the provider's *daily* quota is spent is
 * reported as INCONCLUSIVE (with a CI warning), not as an agent failure: the
 * free tier allows as few as 20 requests/day per model.
 */
import type { EvalSet, Fixture } from "./types"

const geminiKey = process.env.GEMINI_API_KEY
const mongoUri = process.env.TEST_MONGODB_URI

if (!geminiKey || !mongoUri) {
  console.log(
    `EVALS SKIPPED — missing ${[!geminiKey && "GEMINI_API_KEY", !mongoUri && "TEST_MONGODB_URI"]
      .filter(Boolean)
      .join(", ")}. Set both to run the agent eval suite.`
  )
  process.exit(0)
}

process.env.MONGODB_URI = mongoUri
process.env.MONGODB_DB = `velora_evals_${Date.now()}`
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "x".repeat(32)
process.env.AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID ?? "eval-client-id"
process.env.AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET ?? "eval-client-secret"

async function main() {
  const { runAgentTurn } = await import("../src/agent/loop")
  const { GeminiProvider, isTransientLlmError, isDailyQuotaError } = await import("../src/agent/providers/gemini")
  type Provider = import("../src/agent/providers/types").LlmProvider
  const { createMission } = await import("../src/domain/missions")
  const { createTask, listTasks } = await import("../src/domain/tasks")
  const { getDb, closeClient } = await import("../src/adapters/db")
  const { env } = await import("../src/lib/env")

  // Paced to the free tier's per-minute limit with one retry on a rate
  // limit, so a run measures agent behaviour rather than quota luck.
  const minIntervalMs = Number(process.env.EVAL_MIN_INTERVAL_MS ?? 4_500) // Flash-Lite free tier: 15/min
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const gemini = new GeminiProvider()
  let lastCallAt = 0
  let calls = 0
  const provider: Provider = {
    async generate(input) {
      for (let attempt = 0; ; attempt++) {
        const wait = lastCallAt + minIntervalMs - Date.now()
        if (wait > 0) await sleep(wait)
        lastCallAt = Date.now()
        calls++
        try {
          return await gemini.generate(input)
        } catch (error) {
          // A spent daily quota will not recover within this run; don't wait.
          if (attempt > 0 || !isTransientLlmError(error)) throw error
          await sleep(Math.max(minIntervalMs, 15_000))
        }
      }
    },
  }
  // Pacing happens inside the turn, so the turn needs a larger budget than
  // the 30 s users get. Latency is measured separately (NFR-PERF-1).
  const wallClockMs = 6 * Math.max(minIntervalMs, 10_000)
  const userId = "eval-user"

  const { toolSelection } = await import("./sets/tool-selection")
  const { injection } = await import("./sets/injection")
  const { regression } = await import("./sets/regression")
  const allSets: Record<EvalSet, Fixture[]> = {
    "tool-selection": toolSelection,
    injection,
    regression,
  }

  // `npm run evals -- --set injection` runs one set; default runs all.
  const setArg = process.argv.indexOf("--set")
  const only = setArg > -1 ? (process.argv[setArg + 1] as EvalSet) : null
  if (only && !(only in allSets)) {
    console.error(`unknown set "${only}"; expected one of: ${Object.keys(allSets).join(", ")}`)
    process.exit(2)
  }
  const sets = (Object.keys(allSets) as EvalSet[]).filter((s) => !only || s === only)

  type Tally = { passed: number; failed: number; inconclusive: number }
  const tallies = {} as Record<EvalSet, Tally>

  for (const set of sets) {
    const tally: Tally = { passed: 0, failed: 0, inconclusive: 0 }
    tallies[set] = tally
    console.log(`\n${set}/`)

    for (const fixture of allSets[set]) {
      // Fresh mission per fixture so fixtures can't contaminate each other.
      const mission = await createMission(userId, {
        title: "Move from Nairobi to Seoul",
        overview: "Relocating in October for a new job",
      })
      await createTask(userId, mission.id, { label: "Book flights", dueDate: "2026-09-15", priority: "high" })
      await createTask(userId, mission.id, { label: "Find apartment in Seoul", priority: "medium" })

      try {
        const run = await runAgentTurn({
          provider,
          userId,
          missionId: mission.id,
          userMessage: fixture.message,
          wallClockMs,
        })
        const problem = await fixture.check({
          trace: run.trace,
          reply: run.reply,
          tasks: () => listTasks(userId, mission.id),
          today: new Date().toISOString().slice(0, 10),
          proposals: run.proposals.map((p) => ({ tool: p.tool, summary: p.summary })),
        })
        if (problem) {
          tally.failed++
          console.log(`  FAIL  ${fixture.name}\n        ${problem}\n        reply: ${run.reply.slice(0, 160)}`)
        } else {
          tally.passed++
          console.log(`  pass  ${fixture.name}`)
        }
      } catch (error) {
        if (isDailyQuotaError(error)) {
          tally.inconclusive++
          console.log(`  SKIP  ${fixture.name}\n        inconclusive: provider daily quota exhausted`)
        } else {
          tally.failed++
          console.log(`  FAIL  ${fixture.name}\n        threw: ${error instanceof Error ? error.message : error}`)
        }
      }
    }
  }

  await (await getDb()).dropDatabase()
  await closeClient()

  console.log(`\nResults (model ${env().GEMINI_MODEL}, ${calls} model calls)`)
  for (const set of sets) {
    const t = tallies[set]
    const total = t.passed + t.failed + t.inconclusive
    console.log(
      `  ${set.padEnd(15)} ${t.passed}/${total} passed` +
        (t.failed ? `, ${t.failed} FAILED` : "") +
        (t.inconclusive ? `, ${t.inconclusive} inconclusive` : "")
    )
  }

  const failed = sets.reduce((n, s) => n + tallies[s].failed, 0)
  const inconclusive = sets.reduce((n, s) => n + tallies[s].inconclusive, 0)
  if (inconclusive > 0) {
    const note = `${inconclusive} eval fixture(s) could not run: the model's daily quota is exhausted. Re-run the workflow after the quota resets (midnight Pacific).`
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=Evals inconclusive::${note}` : `WARNING: ${note}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
