import { z } from "zod"
import { isoDate } from "./schemas"
import { findCycle } from "./dependencies"

/**
 * A generated mission plan (FR-MSN-1, delivery plan 4-2/4-3): phases of tasks
 * with suggested dates and dependencies. Plans are *proposals* — nothing is
 * created until the user accepts (FR-MSN-2). Tasks reference each other by
 * plan-local `key`s, which become task ids on acceptance.
 */
const planKey = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "keys are lowercase letters, digits and dashes (max 40)")

export const planTaskSchema = z.object({
  key: planKey,
  label: z.string().trim().min(1).max(300),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dependsOn: z.array(planKey).max(10).default([]),
  /** Why this task is in the plan — shown to the user, keeps the plan honest. */
  rationale: z.string().trim().max(400).optional(),
})

export const missionPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2000),
    targetDate: isoDate.nullable().optional(),
    phases: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          tasks: z.array(planTaskSchema).min(1).max(30),
        })
      )
      .min(1)
      .max(8),
  })
  .superRefine((plan, ctx) => {
    const tasks = plan.phases.flatMap((p) => p.tasks)
    const keys = new Set<string>()
    for (const task of tasks) {
      if (keys.has(task.key)) ctx.addIssue({ code: "custom", message: `duplicate task key "${task.key}"` })
      keys.add(task.key)
    }
    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (dep === task.key) ctx.addIssue({ code: "custom", message: `task "${task.key}" depends on itself` })
        else if (!keys.has(dep)) ctx.addIssue({ code: "custom", message: `task "${task.key}" depends on unknown key "${dep}"` })
      }
    }
    const cycle = findCycle(tasks.map((t) => ({ key: t.key, dependsOn: t.dependsOn })))
    if (cycle) ctx.addIssue({ code: "custom", message: `dependency loop: ${cycle.join(" → ")}` })
    if (tasks.length > 60) ctx.addIssue({ code: "custom", message: "a plan has at most 60 tasks" })
  })

export type MissionPlan = z.infer<typeof missionPlanSchema>

/**
 * Date rules the schema can't express: nothing due in the past, and nothing
 * after the target date when one is set. Returns readable problems.
 */
export function planDateIssues(plan: MissionPlan, today: string): string[] {
  const issues: string[] = []
  const target = plan.targetDate?.slice(0, 10)
  if (target && target < today) issues.push(`targetDate ${target} is in the past (today is ${today})`)
  for (const task of plan.phases.flatMap((p) => p.tasks)) {
    const due = task.dueDate?.slice(0, 10)
    if (!due) continue
    if (due < today) issues.push(`task "${task.key}" is due ${due}, which is in the past (today is ${today})`)
    else if (target && due > target) issues.push(`task "${task.key}" is due ${due}, after the target date ${target}`)
  }
  return issues
}
