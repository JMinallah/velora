"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OriginBadge } from "@/components/OriginBadge";
import { formatDisplayDate } from "@/lib/dates";
import type { MissionPlan } from "@/domain/plan";

type Proposal = {
  id: string;
  status: "proposed" | "accepted" | "rejected";
  plan: MissionPlan;
  missionId?: string;
};

/** Removes a task and every reference to it, and drops phases left empty — so the plan stays valid. */
function removeTask(plan: MissionPlan, key: string): MissionPlan {
  return {
    ...plan,
    phases: plan.phases
      .map((phase) => ({
        ...phase,
        tasks: phase.tasks
          .filter((t) => t.key !== key)
          .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== key) })),
      }))
      .filter((phase) => phase.tasks.length > 0),
  };
}

/**
 * Review a drafted plan (FR-MSN-2, delivery plan 4-4). Nothing exists until
 * the user accepts; accepting creates the mission and all tasks at once.
 */
export default function PlanReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params ? String(params.id ?? "") : "";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plans/${id}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data?.success) {
          setLoadError(typeof data?.error === "string" ? data.error : "Couldn't load this plan.");
          return;
        }
        setProposal(data.data);
        setPlan(data.data.plan);
      })
      .catch(() => !cancelled && setLoadError("Couldn't load this plan."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <p role="alert" className="mx-auto max-w-xl p-6 text-sm text-destructive">
        {loadError}
      </p>
    );
  }
  if (!proposal || !plan) return <p className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">Loading plan…</p>;

  if (proposal.status !== "proposed") {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold">{plan.title}</h1>
        {proposal.status === "accepted" && proposal.missionId ? (
          <p>
            You accepted this plan. <Link className="underline" href={`/mission/${proposal.missionId}`}>Open the mission</Link>
          </p>
        ) : (
          <p>
            You discarded this plan. <Link className="underline" href="/onboarding">Draft another one</Link>
          </p>
        )}
      </div>
    );
  }

  const tasks = plan.phases.flatMap((p) => p.tasks);
  const labelOf = (key: string) => tasks.find((t) => t.key === key)?.label ?? key;
  const updateTask = (key: string, patch: Partial<MissionPlan["phases"][number]["tasks"][number]>) =>
    setPlan({
      ...plan,
      phases: plan.phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) })),
    });

  const decide = async (decision: "accept" | "reject") => {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: decision === "accept" ? JSON.stringify({ plan }) : "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (decision === "accept") router.push(`/mission/${data.data.missionId}`);
        else setProposal({ ...proposal, status: "rejected" });
      } else {
        setError(typeof data?.error === "string" ? data.error : "Something went wrong — nothing was saved.");
      }
    } catch {
      setError("Couldn't reach the server — nothing was saved.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <OriginBadge origin="agent" /> Draft plan — review and edit it. Nothing is saved until you accept.
        </p>
        <Input
          aria-label="Mission title"
          value={plan.title}
          onChange={(e) => setPlan({ ...plan, title: e.target.value })}
          className="h-auto border-none px-0 text-3xl font-bold shadow-none focus-visible:ring-0"
          maxLength={200}
        />
        <Textarea
          aria-label="Summary"
          value={plan.summary}
          onChange={(e) => setPlan({ ...plan, summary: e.target.value })}
          className="min-h-16 text-sm text-muted-foreground"
          maxLength={2000}
        />
        <label className="flex items-center gap-2 text-sm">
          Target date
          <Input
            type="date"
            value={plan.targetDate?.slice(0, 10) ?? ""}
            onChange={(e) => setPlan({ ...plan, targetDate: e.target.value || null })}
            className="w-auto"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} in {plan.phases.length} phase{plan.phases.length === 1 ? "" : "s"}
        </p>
      </div>

      {plan.phases.map((phase, phaseIndex) => (
        <section key={phaseIndex} className="space-y-3" aria-label={`Phase ${phaseIndex + 1}`}>
          <Input
            aria-label={`Phase ${phaseIndex + 1} name`}
            value={phase.name}
            onChange={(e) =>
              setPlan({ ...plan, phases: plan.phases.map((p, i) => (i === phaseIndex ? { ...p, name: e.target.value } : p)) })
            }
            className="h-auto border-none px-0 text-sm font-semibold uppercase tracking-wide shadow-none focus-visible:ring-0"
            maxLength={100}
          />
          <ul className="space-y-3">
            {phase.tasks.map((task) => (
              <li key={task.key} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    aria-label={`Task: ${task.label}`}
                    value={task.label}
                    onChange={(e) => updateTask(task.key, { label: e.target.value })}
                    maxLength={300}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Input
                      type="date"
                      aria-label={`Due date for ${task.label}`}
                      value={task.dueDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateTask(task.key, { dueDate: e.target.value || null })}
                      className="h-7 w-auto text-xs"
                    />
                    {task.dueDate && <span>{formatDisplayDate(task.dueDate)}</span>}
                    {task.dependsOn.length > 0 && <span>After: {task.dependsOn.map(labelOf).join(", ")}</span>}
                  </div>
                  {task.rationale && <p className="text-xs text-muted-foreground">Why: {task.rationale}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove "${task.label}"`}
                  onClick={() => setPlan(removeTask(plan, task.key))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("accept")} disabled={isBusy || tasks.length === 0 || !plan.title.trim()}>
          {isBusy ? "Saving…" : "Accept plan"}
        </Button>
        <Button variant="outline" onClick={() => decide("reject")} disabled={isBusy}>
          Discard
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Plans are suggestions — check visa, legal and money details with official sources.
      </p>
    </div>
  );
}
