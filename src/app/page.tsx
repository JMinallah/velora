import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, Plus, Sparkles } from "lucide-react"
import { auth } from "@/lib/auth"
import { listMissions } from "@/domain/missions"
import { summarizeTasks } from "@/domain/tasks"
import { formatDisplayDate } from "@/lib/dates"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Per-user data read at request time; never prerendered at build.
export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from today (UTC) to a stored date; negative when past. */
function daysUntil(value: string): number | null {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.floor((date.getTime() - startOfToday) / DAY_MS)
}

function relativeDay(days: number): string {
  if (days < -1) return `${-days} days overdue`
  if (days === -1) return "1 day overdue"
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  return `in ${days} days`
}

/**
 * Dashboard (docs/06-DELIVERY-PLAN.md 2.5-7): every mission with progress,
 * plus the soonest deadlines across all of them. Server-rendered straight
 * from the domain layer — no AI involved.
 */
export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect("/signin")

  const [missions, summary] = await Promise.all([listMissions(userId), summarizeTasks(userId)])
  const missionTitles = Object.fromEntries(missions.map((m) => [m.id, m.title]))

  if (missions.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Start your first mission</h1>
        <p className="text-muted-foreground">
          A mission is one big change — a move, a new job, starting university — broken into tasks with dates.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/mission/new">
              <Plus /> Plan it myself
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/onboarding">
              <Sparkles /> Plan with AI
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Your missions</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/mission/new">
              <Plus /> New mission
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/onboarding">
              <Sparkles /> Plan with AI
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Coming up
        </h2>
        {summary.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks with due dates.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-background" aria-label="Upcoming tasks">
            {summary.upcoming.map((task) => {
              const days = task.dueDate ? daysUntil(task.dueDate) : null
              return (
                <li key={task.id}>
                  <Link
                    href={`/mission/${task.missionId}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{task.label}</p>
                      <p className="truncate text-sm text-muted-foreground">{missionTitles[task.missionId]}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p>{formatDisplayDate(task.dueDate)}</p>
                      {days !== null && (
                        <p className={days < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                          {relativeDay(days)}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="missions-heading" className="space-y-3">
        <h2 id="missions-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          All missions
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Missions">
          {missions.map((mission) => {
            const counts = summary.counts[mission.id] ?? { total: 0, open: 0 }
            const done = counts.total - counts.open
            const target = formatDisplayDate(mission.targetDate)
            const targetDays = mission.targetDate ? daysUntil(mission.targetDate) : null
            return (
              <li key={mission.id}>
                <Link href={`/mission/${mission.id}`} className="block h-full">
                  <Card className="h-full transition-colors hover:bg-muted/40">
                    <CardHeader>
                      <CardTitle className="line-clamp-2">{mission.title}</CardTitle>
                      <CardDescription>
                        {mission.status ?? "On track"}
                        {target && (
                          <>
                            {" · "}
                            {target}
                            {targetDays !== null && ` (${relativeDay(targetDays)})`}
                          </>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {counts.total === 0 ? "No tasks yet" : `${done} of ${counts.total} tasks done`}
                      </p>
                      {counts.total > 0 && (
                        <div
                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={`${mission.title} progress`}
                          aria-valuemin={0}
                          aria-valuemax={counts.total}
                          aria-valuenow={done}
                        >
                          <div className="h-full bg-primary" style={{ width: `${(done / counts.total) * 100}%` }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
