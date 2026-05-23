import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { missionSummaries } from "@/lib/missions";
import {
  ArrowRight,
  Clock3,
  FileText,
  Layers3,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const sharedDocuments = Array.from(
  new Map(
    missionSummaries.flatMap((mission) =>
      mission.documents.map((document) => [document.name, document])
    )
  ).values()
);

export default function Dashboard() {
  const activeMissionCount = missionSummaries.length;
  const documentCount = sharedDocuments.length;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_38%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_32%),linear-gradient(to_bottom,rgba(255,255,255,0.8),transparent)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.15),transparent_38%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_32%),linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent)]" />

      <div className="flex flex-col gap-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 p-6 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-sm md:p-8">
          <div className="absolute -right-20 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-16 left-1/2 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] lg:items-end">
            <div className="space-y-5">
              <Badge variant="outline" className="w-fit gap-2 border-border/70 bg-background/80">
                <Sparkles className="h-3.5 w-3.5" />
                Mission control
              </Badge>

              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                  A single place to see what matters, what&apos;s next, and what can wait.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  Velora keeps your missions linked to the documents and decisions
                  behind them, so the dashboard feels like an operations table instead
                  of a stack of generic cards.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/mission/1">
                  <Button className="gap-2 rounded-full px-5">
                    Open workbench
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/onboarding">
                  <Button variant="outline" className="rounded-full px-5">
                    Create mission
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{activeMissionCount} active missions</p>
                  <p className="text-sm text-muted-foreground">Tracked across planning, compliance, and arrival.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Timeline-first workflow</p>
                  <p className="text-sm text-muted-foreground">Chat, actions, and tasks stay attached to the same mission.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{documentCount} shared documents</p>
                  <p className="text-sm text-muted-foreground">Reusable across missions, but still referenced in context.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
          <div className="rounded-[1.75rem] border border-border/60 bg-background/80 p-5 shadow-sm md:p-6">
            <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Missions
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  What&apos;s active right now
                </h2>
              </div>
              <p className="hidden text-sm text-muted-foreground md:block">
                Click any mission to jump into its workbench.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {missionSummaries.map((mission, index) => (
                <Link
                  key={mission.id}
                  href={`/mission/${mission.id}`}
                  className="group block rounded-[1.35rem] border border-border/60 bg-card/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          0{index + 1}
                        </span>
                        <Badge variant="secondary" className="rounded-full px-2.5">
                          {mission.phase}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-2.5">
                          {mission.status}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{mission.title}</p>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                          {mission.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                      <div className="rounded-2xl bg-muted/60 px-3 py-2 text-right">
                        <p className="text-xs uppercase tracking-wide">Next</p>
                        <p className="max-w-56 text-sm text-foreground">{mission.nextStep}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5 shadow-sm md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Quick start
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Open the mission workspace
                  </h2>
                </div>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Ask about deadlines, upload a document, or jump straight into a mission
                without hunting through nested dashboards.
              </p>

              <div className="mt-5 space-y-3">
                <Link href="/mission/1" className="block">
                  <Button className="w-full rounded-full">Ask in Timeline</Button>
                </Link>
                <Link href="/onboarding" className="block">
                  <Button variant="outline" className="w-full rounded-full">
                    Create a new mission
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/60 bg-card/80 p-5 shadow-sm md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Documents
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Shared across missions
                  </h2>
                </div>
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="mt-4 space-y-3">
                {sharedDocuments.map((document) => (
                  <div
                    key={document.name}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-muted/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{document.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{document.note}</p>
                    </div>
                    <Link href={document.href} className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
