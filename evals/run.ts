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
 * free tier allows as few as 20 requests/day per model. A fixture that fails
 * while the provider is failing (503 "high demand", timeouts) is retried
 * from scratch, up to 3 attempts; it still has to genuinely pass.
 */
import { FLIGHTS_DUE, type AgentEvalSet, type EvalSet, type Fixture } from "./types"

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
  // Provider-side failures (overload, timeouts) seen so far; a fixture that
  // fails while this grew is retried instead of blamed on the agent.
  let providerTrouble = 0
  const isAbort = (error: unknown) => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
  const paced = async <T>(call: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCallAt + minIntervalMs - Date.now()
      if (wait > 0) await sleep(wait)
      lastCallAt = Date.now()
      calls++
      try {
        return await call()
      } catch (error) {
        if (isTransientLlmError(error) || isAbort(error)) providerTrouble++
        // A spent daily quota will not recover within this run; don't wait.
        if (attempt > 0 || !isTransientLlmError(error)) throw error
        await sleep(Math.max(minIntervalMs, 15_000))
      }
    }
  }
  const provider: Provider = {
    generate: (input) => paced(() => gemini.generate(input)),
    generateStructured: (input) => paced(() => gemini.generateStructured(input)),
  }
  // Pacing happens inside the turn, so the turn needs a larger budget than
  // the 30 s users get. Latency is measured separately (NFR-PERF-1).
  const wallClockMs = 6 * Math.max(minIntervalMs, 10_000)
  const userId = "eval-user"

  const { toolSelection } = await import("./sets/tool-selection")
  const { injection } = await import("./sets/injection")
  const { regression } = await import("./sets/regression")
  const { planning } = await import("./sets/planning")
  const { generatePlan, PlanGenerationError } = await import("../src/agent/planner")
  const { documents } = await import("./sets/documents")
  const { extractDocument, ExtractionError } = await import("../src/agent/extractor")
  const { readFileSync } = await import("node:fs")
  const allSets: Record<AgentEvalSet, Fixture[]> = {
    "tool-selection": toolSelection,
    injection,
    regression,
  }

  // `npm run evals -- --set injection` runs one set; default runs all.
  const setArg = process.argv.indexOf("--set")
  const only = setArg > -1 ? (process.argv[setArg + 1] as EvalSet) : null
  if (only && !(only in allSets) && only !== "planning" && only !== "documents") {
    console.error(`unknown set "${only}"; expected one of: ${Object.keys(allSets).join(", ")}`)
    process.exit(2)
  }
  const sets = ([...Object.keys(allSets), "planning", "documents"] as EvalSet[]).filter((s) => !only || s === only)

  type Tally = { passed: number; failed: number; inconclusive: number }
  const tallies = {} as Record<EvalSet, Tally>

  /**
   * Runs one fixture. `run` returns a problem (or null for a pass) plus a
   * note for the log; a throw is a failure. When the model provider failed
   * during a failing attempt (503 "high demand", timeouts), the fixture is
   * retried from scratch after a pause, up to MAX_TRIES — it still has to
   * genuinely pass; only a spent daily quota counts as inconclusive.
   */
  const MAX_TRIES = 3
  const evaluate = async (
    tally: Tally,
    name: string,
    run: () => Promise<{ problem: string | null; note?: string }>,
    describeError: (error: unknown) => string = (error) => (error instanceof Error ? error.message : String(error))
  ) => {
    for (let attempt = 1; ; attempt++) {
      const troubleBefore = providerTrouble
      let outcome: { problem: string | null; note?: string }
      try {
        outcome = await run()
      } catch (error) {
        if (isDailyQuotaError(error)) {
          tally.inconclusive++
          console.log(`  SKIP  ${name}\n        inconclusive: provider daily quota exhausted`)
          return
        }
        outcome = { problem: `threw: ${describeError(error).slice(0, 300)}` }
      }
      const suffix = outcome.note ? ` (${outcome.note})` : ""
      if (!outcome.problem) {
        tally.passed++
        console.log(`  pass  ${name}${suffix}${attempt > 1 ? ` [attempt ${attempt}]` : ""}`)
        return
      }
      const providerFault = providerTrouble > troubleBefore
      if (providerFault && attempt < MAX_TRIES) {
        console.log(`  ....  ${name}\n        model provider unavailable mid-run; retrying in 30 s`)
        await sleep(30_000)
        continue
      }
      tally.failed++
      console.log(
        `  FAIL  ${name}${suffix}\n        ${outcome.problem}` +
          (providerFault ? `\n        (the model provider was failing on every attempt — re-run later)` : "")
      )
      return
    }
  }

  for (const set of sets) {
    const tally: Tally = { passed: 0, failed: 0, inconclusive: 0 }
    tallies[set] = tally
    console.log(`\n${set}/`)

    if (set === "documents") {
      for (const fixture of documents) {
        await evaluate(
          tally,
          fixture.name,
          async () => {
            const data = readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url))
            const { extraction } = await extractDocument({ provider, mimeType: fixture.mimeType, data })
            const problem = fixture.check(extraction)
            return { problem: problem && `${problem}\n        got: ${JSON.stringify(extraction).slice(0, 240)}` }
          },
          (error) => (error instanceof ExtractionError ? error.message : String(error))
        )
      }
      continue
    }

    if (set === "planning") {
      for (const fixture of planning) {
        await evaluate(
          tally,
          fixture.name,
          async () => {
            const today = new Date().toISOString().slice(0, 10)
            const { plan, attempts } = await generatePlan({ provider, ...fixture.request, today })
            const note = `${plan.phases.flatMap((p) => p.tasks).length} tasks / ${plan.phases.length} phases, attempt ${attempts}`
            return { problem: fixture.check({ plan, attempts, today }), note }
          },
          (error) => (error instanceof PlanGenerationError ? error.issues.slice(0, 5).join("; ") : String(error))
        )
      }
      continue
    }

    for (const fixture of allSets[set]) {
      await evaluate(tally, fixture.name, async () => {
        // Fresh mission per attempt so fixtures (and retries) can't contaminate each other.
        const mission = await createMission(userId, {
          title: "Move from Nairobi to Seoul",
          overview: "Relocating in October for a new job",
        })
        await createTask(userId, mission.id, { label: "Book flights", dueDate: FLIGHTS_DUE, priority: "high" })
        await createTask(userId, mission.id, { label: "Find apartment in Seoul", priority: "medium" })
        for (const seed of fixture.seedTasks ?? []) await createTask(userId, mission.id, { label: seed.label })

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
          replans: run.replans.map((r) => ({ summary: r.summary })),
        })
        return { problem: problem && `${problem}\n        reply: ${run.reply.slice(0, 160)}` }
      })
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
