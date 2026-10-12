import { describe, it, expect } from "vitest"
import { findCycle, dependencyProblem } from "@/domain/dependencies"
import { missionPlanSchema } from "@/domain/plan"

describe("findCycle", () => {
  it("returns null for a DAG and the loop when there is one", () => {
    expect(findCycle([{ key: "a", dependsOn: [] }, { key: "b", dependsOn: ["a"] }, { key: "c", dependsOn: ["a", "b"] }])).toBeNull()
    expect(findCycle([{ key: "a", dependsOn: ["c"] }, { key: "b", dependsOn: ["a"] }, { key: "c", dependsOn: ["b"] }])).toEqual([
      "a",
      "c",
      "b",
      "a",
    ])
  })
})

describe("dependencyProblem", () => {
  const tasks = [
    { id: "lease", label: "Sign lease", dependsOn: [] },
    { id: "movers", label: "Book movers", dependsOn: ["lease"] },
  ]
  it("accepts valid lists and explains invalid ones", () => {
    expect(dependencyProblem("movers", ["lease"], tasks)).toBeNull()
    expect(dependencyProblem("lease", ["lease"], tasks)).toMatch(/itself/)
    expect(dependencyProblem("lease", ["elsewhere"], tasks)).toMatch(/this mission/)
    expect(dependencyProblem("lease", ["movers"], tasks)).toBe("That would create a loop: Sign lease → Book movers → Sign lease.")
  })
})

describe("missionPlanSchema", () => {
  const plan = (tasks: unknown[]) => ({
    title: "Move to Seoul",
    summary: "Relocating for a new job in October",
    phases: [{ name: "Before you go", tasks }],
  })
  const task = (key: string, dependsOn: string[] = []) => ({ key, label: `Task ${key}`, dependsOn })

  it("accepts a valid plan and defaults dependsOn", () => {
    const parsed = missionPlanSchema.safeParse(plan([{ key: "visa", label: "Apply for visa", dueDate: "2026-09-01" }, task("flights", ["visa"])]))
    expect(parsed.success).toBe(true)
    expect(parsed.data?.phases[0].tasks[0].dependsOn).toEqual([])
  })

  it("rejects duplicate keys, unknown or self references, loops, bad keys and bad dates", () => {
    const issues = (tasks: unknown[]) => {
      const r = missionPlanSchema.safeParse(plan(tasks))
      return r.success ? [] : r.error.issues.map((i) => i.message)
    }
    expect(issues([task("a"), task("a")])).toContain('duplicate task key "a"')
    expect(issues([task("a", ["ghost"])])).toContain('task "a" depends on unknown key "ghost"')
    expect(issues([task("a", ["a"])])).toContain('task "a" depends on itself')
    expect(issues([task("a", ["b"]), task("b", ["a"])]).some((m) => m.startsWith("dependency loop"))).toBe(true)
    expect(issues([task("Not OK")]).length).toBeGreaterThan(0)
    expect(issues([{ key: "a", label: "x", dueDate: "next week" }]).length).toBeGreaterThan(0)
  })
})

import { replanIssues, replanDiffSchema } from "@/domain/replan"

describe("replanIssues (4-5)", () => {
  const today = "2026-10-12"
  const tasks = [
    { id: "lease", label: "Sign lease", dependsOn: [] },
    { id: "movers", label: "Book movers", dependsOn: ["lease"] },
  ] as never[]
  const diff = (d: Record<string, unknown>) => replanDiffSchema.parse({ reason: "dates moved", ...d })

  it("accepts a coherent diff", () => {
    expect(
      replanIssues(
        diff({
          add: [{ key: "storage", label: "Book storage", dueDate: "2026-11-01", dependsOn: ["lease"] }],
          change: [{ taskId: "movers", dueDate: "2026-11-15" }],
        }),
        tasks,
        today
      )
    ).toEqual([])
  })

  it("explains every problem", () => {
    expect(replanIssues(diff({}), tasks, today)).toEqual(["the re-plan changes nothing"])
    expect(replanIssues(diff({ remove: ["ghost"] }), tasks, today)).toContain('remove: no task with id "ghost"')
    expect(replanIssues(diff({ change: [{ taskId: "movers" }] }), tasks, today)).toContain('change for "movers" changes nothing')
    expect(replanIssues(diff({ change: [{ taskId: "movers", dueDate: "2026-01-01" }] }), tasks, today)).toContain(
      '"movers" would be due 2026-01-01, in the past'
    )
    expect(
      replanIssues(diff({ remove: ["lease"], add: [{ key: "x", label: "X", dependsOn: ["lease"] }] }), tasks, today)
    ).toContain('added task "x" depends on unknown or removed "lease"')
    expect(
      replanIssues(diff({ add: [{ key: "a", label: "A", dependsOn: ["b"] }, { key: "b", label: "B", dependsOn: ["a"] }] }), tasks, today).some((i) =>
        i.startsWith("dependency loop")
      )
    ).toBe(true)
  })
})
