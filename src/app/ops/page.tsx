"use client";

import { useEffect, useState } from "react";
import type { OpsSnapshot } from "@/domain/ops";

const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 1)}%`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");

/**
 * Ops page (NFR-OBS-3): is the AI budget holding, are requests failing, are
 * reminders going out. For admins (ADMIN_EMAILS); others see "not found".
 */
export default function OpsPage() {
  const [data, setData] = useState<OpsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/ops")
        .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
          if (cancelled) return;
          if (ok && body?.success) {
            setData(body.data);
            setError(null);
          } else setError(res404(body));
        })
        .catch(() => !cancelled && setError("Couldn't load the ops data."));
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error) return <p className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">{error}</p>;
  if (!data) return <p className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">Loading…</p>;

  const { ai, last24h, reminders } = data;
  const problems = [
    !ai.enabled && "AI is switched off (no GEMINI_API_KEY).",
    ai.exhausted && `AI budget spent for today (resets ${time(ai.resetsAt)}).`,
    reminders.late > 0 && `${reminders.late} reminder(s) are over 30 minutes late — is the scheduler running?`,
    last24h.errorRate > 0.02 && `Server error rate is ${pct(last24h.errorRate)} over 24 hours.`,
    last24h.llmCalls > 0 && last24h.llmFailures / last24h.llmCalls > 0.1 && `${pct(last24h.llmFailures / last24h.llmCalls)} of model calls failed.`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">Updated {time(data.generatedAt)} · refreshes every minute</p>
      </div>

      <section aria-label="Problems" className="rounded-lg border p-4 text-sm">
        {problems.length === 0 ? (
          <p>Nothing needs attention.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <Facts
          title="AI today"
          rows={[
            ["Model", ai.enabled ? ai.model : "off"],
            ["Calls", `${ai.calls} of ${ai.cap}`],
            ["Status", ai.exhausted ? "paused" : "available"],
            ["Resets", time(ai.resetsAt)],
          ]}
        />
        <Facts
          title="Last 24 hours"
          rows={[
            ["API requests", String(last24h.requests)],
            ["Server errors", `${last24h.serverErrors} (${pct(last24h.errorRate)})`],
            ["Rate-limited", String(last24h.rateLimited)],
            ["Model calls", `${last24h.llmCalls} (${last24h.llmFailures} failed)`],
            ["Avg model latency", last24h.llmAvgMs === null ? "—" : `${(last24h.llmAvgMs / 1000).toFixed(1)} s`],
          ]}
        />
        <Facts
          title="Reminders"
          rows={[
            ["Last dispatch", time(reminders.lastDispatchAt)],
            ["Late (> 30 min)", String(reminders.late)],
            ...Object.entries(reminders.byStatus).map(([status, n]): [string, string] => [status, String(n)]),
            ...Object.entries(last24h.dispatchOutcomes).map(([outcome, n]): [string, string] => [`${outcome} (24 h)`, String(n)]),
          ]}
        />
      </div>

      <section aria-labelledby="hourly" className="space-y-2">
        <h2 id="hourly" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By hour (UTC)
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {["Hour", "Requests", "Server errors", "Rate-limited", "Model calls", "Model failures"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.hours].reverse().map((h) => (
                <tr key={h.hour} className="border-t">
                  <td className="px-3 py-1.5">{h.hour.slice(5, 13).replace("T", " ")}:00</td>
                  <td className="px-3 py-1.5">{h.requests}</td>
                  <td className={`px-3 py-1.5 ${h.serverErrors ? "text-destructive" : ""}`}>{h.serverErrors}</td>
                  <td className="px-3 py-1.5">{h.rateLimited}</td>
                  <td className="px-3 py-1.5">{h.llmCalls}</td>
                  <td className={`px-3 py-1.5 ${h.llmFailures ? "text-destructive" : ""}`}>{h.llmFailures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function res404(body: { error?: unknown } | null): string {
  return typeof body?.error === "string" && body.error !== "not found" ? body.error : "Page not found.";
}

function Facts({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section aria-label={title} className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <dl className="space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
