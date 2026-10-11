import { describe, it, expect } from "vitest"
import { computeRisk } from "@/domain/risk"

const today = "2026-10-11"
const task = (id: string, dueDate: string | null, extra: Partial<{ completed: boolean; dependsOn: string[]; label: string }> = {}) => ({
  id,
  label: extra.label ?? id,
  completed: extra.completed ?? false,
  dueDate,
  dependsOn: extra.dependsOn ?? [],
})

describe("computeRisk (FR-MSN-5)", () => {
  it("is on track with nothing overdue, naming the next deadline", () => {
    expect(computeRisk({ today, tasks: [task("Book flights", "2026-10-20")] })).toEqual({
      level: "on-track",
      reasons: ['Nothing is overdue. Next deadline: "Book flights" in 9 days.'],
    })
    expect(computeRisk({ today, tasks: [] }).reasons).toEqual(["Nothing is overdue."])
    expect(computeRisk({ today, tasks: [task("a", "2026-01-01", { completed: true })] })).toEqual({
      level: "on-track",
      reasons: ["All tasks are done."],
    })
  })

  it("is at risk with a recently overdue task", () => {
    expect(computeRisk({ today, tasks: [task("Renew passport", "2026-10-09")] })).toEqual({
      level: "at-risk",
      reasons: ['"Renew passport" is 2 days overdue.'],
    })
  })

  it("is off track when something is more than a week overdue, or three or more are", () => {
    expect(computeRisk({ today, tasks: [task("Visa", "2026-09-30")] }).level).toBe("off-track")
    const three = computeRisk({ today, tasks: [task("a", "2026-10-10"), task("b", "2026-10-09"), task("c", "2026-10-08")] })
    expect(three.level).toBe("off-track")
    expect(three.reasons[0]).toBe('3 tasks are overdue, the oldest by 3 days: "c", "b", "a".')
  })

  it("flags a task due soon that is still waiting on an unfinished prerequisite", () => {
    const risk = computeRisk({
      today,
      tasks: [
        task("visa", null, { label: "Apply for visa" }),
        task("flights", "2026-10-14", { label: "Book flights", dependsOn: ["visa"] }),
      ],
    })
    expect(risk).toEqual({ level: "at-risk", reasons: ['"Book flights" is due in 3 days but is waiting on "Apply for visa".'] })
    // ...but not once the prerequisite is done.
    const done = computeRisk({
      today,
      tasks: [task("visa", null, { completed: true }), task("flights", "2026-10-14", { dependsOn: ["visa"] })],
    })
    expect(done.level).toBe("on-track")
  })

  it("watches the target date", () => {
    const passed = computeRisk({ today, targetDate: "2026-10-01", tasks: [task("a", null)] })
    expect(passed).toEqual({ level: "off-track", reasons: ["The target date passed 10 days ago with 1 task still open."] })

    const close = computeRisk({ today, targetDate: "2026-10-13", tasks: ["a", "b", "c"].map((id) => task(id, null)) })
    expect(close).toEqual({ level: "at-risk", reasons: ["The target date is in 2 days and 3 tasks are still open."] })

    expect(computeRisk({ today, targetDate: "2026-12-01", tasks: [task("a", null)] }).level).toBe("on-track")
    expect(computeRisk({ today, targetDate: "2026-10-01", tasks: [task("a", null, { completed: true })] }).level).toBe("on-track")
  })
})
