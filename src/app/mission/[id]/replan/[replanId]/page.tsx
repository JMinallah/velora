"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Minus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/OriginBadge";
import { formatDisplayDate } from "@/lib/dates";
import type { ReplanDiff } from "@/domain/replan";

type Snapshot = { id: string; label: string; dueDate?: string | null; priority?: string; phase?: string };
type Replan = {
  id: string;
  status: "proposed" | "accepted" | "rejected";
  diff: ReplanDiff;
  before: Snapshot[];
  taskLabels: Record<string, string>;
  missionTargetDate: string | null;
};

const show = (value: string | null | undefined, kind: "date" | "text") =>
  value ? (kind === "date" ? formatDisplayDate(value) ?? value : value) : "none";

/**
 * Review a proposed re-plan (FR-MSN-4): a per-task diff — added, changed
 * (old → new), removed. Accepting applies all of it at once; rejecting
 * leaves the mission exactly as it is.
 */
export default function ReplanReviewPage() {
  const params = useParams();
  const router = useRouter();
  const missionId = params ? String(params.id ?? "") : "";
  const replanId = params ? String(params.replanId ?? "") : "";
  const [replan, setReplan] = useState<Replan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/missions/${missionId}/replans/${replanId}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && data?.success) setReplan(data.data);
        else setLoadError(typeof data?.error === "string" ? data.error : "Couldn't load this re-plan.");
      })
      .catch(() => !cancelled && setLoadError("Couldn't load this re-plan."));
    return () => {
      cancelled = true;
    };
  }, [missionId, replanId]);

  if (loadError) return <p role="alert" className="mx-auto max-w-xl p-6 text-sm text-destructive">{loadError}</p>;
  if (!replan) return <p className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">Loading re-plan…</p>;

  const { diff } = replan;
  const before = new Map(replan.before.map((t) => [t.id, t]));
  const addedLabel = new Map(diff.add.map((a) => [a.key, a.label]));
  const depLabel = (id: string) => addedLabel.get(id) ?? replan.taskLabels[id] ?? id;

  const decide = async (decision: "accept" | "reject") => {
    setIsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/replans/${replanId}/${decision}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (decision === "accept") router.push(`/mission/${missionId}`);
        else setReplan({ ...replan, status: "rejected" });
      } else {
        setError(typeof data?.error === "string" ? data.error : "Something went wrong — nothing was changed.");
      }
    } catch {
      setError("Couldn't reach the server — nothing was changed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <OriginBadge origin="agent" /> Proposed re-plan
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Review the changes</h1>
        <p className="text-sm">
          <span className="text-muted-foreground">Why: </span>
          {diff.reason}
        </p>
        {replan.status !== "proposed" && (
          <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">
            {replan.status === "accepted" ? "You accepted this re-plan." : "You rejected this re-plan — nothing was changed."}{" "}
            <Link className="underline" href={`/mission/${missionId}`}>Back to the mission</Link>
          </p>
        )}
      </div>

      {diff.targetDate !== undefined && (
        <section aria-label="Target date" className="rounded-lg border p-3 text-sm">
          Target date: {show(replan.missionTargetDate, "date")} → <strong>{show(diff.targetDate, "date")}</strong>
        </section>
      )}

      {diff.add.length > 0 && (
        <section aria-label="Added tasks" className="space-y-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <Plus className="size-4" aria-hidden /> Add {diff.add.length}
          </h2>
          <ul className="space-y-2">
            {diff.add.map((a) => (
              <li key={a.key} className="rounded-lg border border-emerald-600/30 p-3 text-sm">
                <p className="font-medium">{a.label}</p>
                <p className="text-xs text-muted-foreground">
                  {[a.phase, a.priority, a.dueDate && `due ${show(a.dueDate, "date")}`, a.dependsOn.length && `after ${a.dependsOn.map(depLabel).join(", ")}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {diff.change.length > 0 && (
        <section aria-label="Changed tasks" className="space-y-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-primary">
            <Pencil className="size-4" aria-hidden /> Change {diff.change.length}
          </h2>
          <ul className="space-y-2">
            {diff.change.map((c) => {
              const old = before.get(c.taskId);
              const rows: [string, string, string][] = [];
              if (c.label !== undefined) rows.push(["Name", show(old?.label, "text"), c.label]);
              if (c.dueDate !== undefined) rows.push(["Due", show(old?.dueDate, "date"), show(c.dueDate, "date")]);
              if (c.priority !== undefined) rows.push(["Priority", show(old?.priority, "text"), c.priority]);
              if (c.phase !== undefined) rows.push(["Phase", show(old?.phase, "text"), c.phase]);
              return (
                <li key={c.taskId} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{old?.label ?? c.taskId}</p>
                  {rows.map(([field, from, to]) => (
                    <p key={field} className="text-xs">
                      <span className="text-muted-foreground">{field}: </span>
                      <span className="line-through text-muted-foreground">{from}</span> → <strong>{to}</strong>
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {diff.remove.length > 0 && (
        <section aria-label="Removed tasks" className="space-y-2">
          <h2 className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-destructive">
            <Minus className="size-4" aria-hidden /> Remove {diff.remove.length}
          </h2>
          <ul className="space-y-2">
            {diff.remove.map((id) => (
              <li key={id} className="rounded-lg border border-destructive/30 p-3 text-sm line-through">
                {before.get(id)?.label ?? id}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {replan.status === "proposed" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("accept")} disabled={isBusy}>{isBusy ? "Applying…" : "Accept changes"}</Button>
          <Button variant="outline" onClick={() => decide("reject")} disabled={isBusy}>Reject</Button>
        </div>
      )}
    </div>
  );
}
