/**
 * Plan generation (delivery plan 4-3): structured output → validation →
 * up to two repair rounds with the exact problems. Scripted provider, no network.
 */
import { describe, it, expect } from "vitest"
import { generatePlan, planJsonSchema, PlanGenerationError } from "@/agent/planner"
import type { LlmProvider } from "@/agent/providers/types"

const today = "2026-10-11"
const validPlan = {
  title: "Move to Seoul",
  summary: "Relocating from Nairobi for a new job",
  targetDate: "2026-12-01",
  phases: [
    {
      name: "Paperwork",
      tasks: [
        { key: "visa-reqs", label: "Check visa requirements on the embassy site", rationale: "Rules change" },
        { key: "apply-visa", label: "Apply for work visa", dueDate: "2026-10-25", dependsOn: ["visa-reqs"] },
      ],
    },
    { name: "Logistics", tasks: [{ key: "flights", label: "Book flights", dueDate: "2026-11-20", dependsOn: ["apply-visa"] }] },
  ],
}

function scripted(answers: string[]) {
  const prompts: string[] = []
  const provider: LlmProvider = {
    generate: async () => ({ text: "", toolCalls: [] }),
    generateStructured: async ({ prompt }) => {
      prompts.push(prompt)
      return answers[Math.min(prompts.length - 1, answers.length - 1)]
    },
  }
  return { provider, prompts }
}

describe("generatePlan", () => {
  it("returns a valid plan on the first attempt", async () => {
    const { provider } = scripted([JSON.stringify(validPlan)])
    const result = await generatePlan({ provider, goal: "Move to Seoul", today })
    expect(result.attempts).toBe(1)
    expect(result.plan.phases).toHaveLength(2)
    expect(result.plan.phases[0].tasks[0].dependsOn).toEqual([])
    expect(result.promptVersion).toBe("planner.v1")
  })

  it("repairs invalid answers by feeding back the exact problems", async () => {
    const looping = structuredClone(validPlan)
    looping.phases[0].tasks[0].dependsOn = ["flights"] as never
    const { provider, prompts } = scripted(["not json at all", JSON.stringify(looping), JSON.stringify(validPlan)])

    const result = await generatePlan({ provider, goal: "Move to Seoul", deadline: "December", today })
    expect(result.attempts).toBe(3)
    expect(prompts[0]).toContain("What they're planning: Move to Seoul")
    expect(prompts[0]).toContain(`Today's date: ${today}`)
    expect(prompts[1]).toContain("the answer was not valid JSON")
    expect(prompts[2]).toMatch(/dependency loop: .*flights/)
  })

  it("treats a due date in the past, or after the target date, as a problem to repair", async () => {
    const past = structuredClone(validPlan)
    past.phases[1].tasks[0].dueDate = "2026-01-01"
    const late = structuredClone(validPlan)
    late.phases[1].tasks[0].dueDate = "2027-02-01"
    const { provider, prompts } = scripted([JSON.stringify(past), JSON.stringify(late), JSON.stringify(validPlan)])
    await generatePlan({ provider, goal: "Move", today })
    expect(prompts[1]).toContain('task "flights" is due 2026-01-01, which is in the past')
    expect(prompts[2]).toContain('task "flights" is due 2027-02-01, after the target date 2026-12-01')
  })

  it("gives up after three invalid answers with the problems, never returning an invalid plan", async () => {
    const { provider } = scripted(['{"title": ""}'])
    await expect(generatePlan({ provider, goal: "Move", today })).rejects.toBeInstanceOf(PlanGenerationError)
  })
})

describe("planJsonSchema", () => {
  it("omits maxItems, which Gemini rejects, and keeps the rest", () => {
    const schema = JSON.stringify(planJsonSchema())
    expect(schema).not.toContain("maxItems")
    expect(schema).toContain("minItems")
    expect(schema).toContain('"pattern"')
  })
})
