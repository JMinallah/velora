/**
 * Mission risk (FR-MSN-5, delivery plan 4-6): on track / at risk / off track,
 * with plain-language reasons. Pure — no database access — so the same rules
 * run on the dashboard (server), the mission page (browser, updating as the
 * user ticks tasks off) and in the agent's mission snapshot.
 */
export type RiskLevel = "on-track" | "at-risk" | "off-track"
export type Risk = { level: RiskLevel; reasons: string[] }

type RiskTask = { id: string; label: string; completed: boolean; dueDate?: string | null; dependsOn?: string[] }

const DAY_MS = 24 * 60 * 60 * 1000
const SOON_DAYS = 7
const TARGET_WARNING_DAYS = 14
const SEVERELY_LATE_DAYS = 7
const MANY_OVERDUE = 3

/** Whole days from `today` to `date` (both YYYY-MM-DD; datetimes use their date part). */
function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const quoteList = (labels: string[], max = 3) =>
  labels.slice(0, max).map((l) => `"${l}"`).join(", ") + (labels.length > max ? ` and ${labels.length - max} more` : "")

export function computeRisk(input: { targetDate?: string | null; tasks: RiskTask[]; today: string }): Risk {
  const { tasks, today } = input
  const open = tasks.filter((t) => !t.completed)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let level: RiskLevel = "on-track"
  const raise = (to: RiskLevel) => {
    if (to === "off-track" || (to === "at-risk" && level === "on-track")) level = to
  }
  const reasons: string[] = []

  // Overdue work.
  const overdue = open
    .filter((t) => t.dueDate && daysBetween(today, t.dueDate) < 0)
    .map((t) => ({ task: t, late: -daysBetween(today, t.dueDate!) }))
    .sort((a, b) => b.late - a.late)
  if (overdue.length) {
    const worst = overdue[0]
    raise(overdue.length >= MANY_OVERDUE || worst.late > SEVERELY_LATE_DAYS ? "off-track" : "at-risk")
    reasons.push(
      overdue.length === 1
        ? `"${worst.task.label}" is ${plural(worst.late, "day")} overdue.`
        : `${overdue.length} tasks are overdue, the oldest by ${plural(worst.late, "day")}: ${quoteList(overdue.map((o) => o.task.label))}.`
    )
  }

  // Due soon but still waiting on unfinished prerequisites.
  for (const task of open) {
    if (!task.dueDate) continue
    const days = daysBetween(today, task.dueDate)
    if (days < 0 || days > SOON_DAYS) continue
    const waitingOn = (task.dependsOn ?? []).map((id) => byId.get(id)).filter((d): d is RiskTask => Boolean(d && !d.completed))
    if (!waitingOn.length) continue
    raise("at-risk")
    reasons.push(
      `"${task.label}" is due ${days === 0 ? "today" : `in ${plural(days, "day")}`} but is waiting on ${quoteList(waitingOn.map((d) => d.label))}.`
    )
  }

  // The target date.
  if (input.targetDate && open.length) {
    const days = daysBetween(today, input.targetDate)
    if (days < 0) {
      raise("off-track")
      reasons.push(`The target date passed ${plural(-days, "day")} ago with ${plural(open.length, "task")} still open.`)
    } else if (days <= TARGET_WARNING_DAYS) {
      const urgent = open.filter((t) => !t.dueDate || daysBetween(today, t.dueDate) >= 0)
      if (urgent.length > Math.max(1, days)) {
        raise("at-risk")
        reasons.push(`The target date is ${days === 0 ? "today" : `in ${plural(days, "day")}`} and ${plural(open.length, "task")} are still open.`)
      }
    }
  }

  if (level === "on-track") {
    const next = open
      .filter((t) => t.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
    if (!open.length && tasks.length) reasons.push("All tasks are done.")
    else if (next) {
      const days = daysBetween(today, next.dueDate!)
      reasons.push(`Nothing is overdue. Next deadline: "${next.label}" ${days === 0 ? "today" : `in ${plural(days, "day")}`}.`)
    } else reasons.push("Nothing is overdue.")
  }
  return { level, reasons }
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
}
