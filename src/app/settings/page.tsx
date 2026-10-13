"use client";

import { useEffect, useState } from "react";
import type { NotificationPreferences } from "@/types";

type Prefs = NotificationPreferences & { emailAddress: string | null };

const LEAD_OPTIONS = [
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 2, label: "2 days before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
];

/**
 * Notification preferences (FR-REM-1): which channels reminders use, and
 * when task due-date reminders fire. Each change saves immediately.
 */
export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [status, setStatus] = useState<{ kind: "saving" | "saved" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Read in the effect, not during render: the server doesn't know the device's zone.
    setTimeout(() => !cancelled && setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null), 0);
    fetch("/api/settings/notifications")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && data?.success) setPrefs(data.data);
        else setLoadError(typeof data?.error === "string" ? data.error : "Couldn't load your settings.");
      })
      .catch(() => !cancelled && setLoadError("Couldn't load your settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<NotificationPreferences>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setStatus({ kind: "saving", text: "Saving…" });
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Couldn't save.");
      setPrefs(data.data);
      setStatus({ kind: "saved", text: "Saved" });
    } catch (err) {
      setPrefs(previous);
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    }
  }

  if (loadError) return <p role="alert" className="mx-auto max-w-xl p-6 text-sm text-destructive">{loadError}</p>;
  if (!prefs) return <p className="mx-auto max-w-xl p-6 text-sm text-muted-foreground">Loading settings…</p>;

  const zoneMismatch = deviceZone && deviceZone !== prefs.timeZone;

  return (
    <div className="mx-auto w-full max-w-xl space-y-8 pb-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p
          role={status?.kind === "error" ? "alert" : "status"}
          className={`text-sm ${status?.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {status?.text}
        </p>
      </div>

      <section aria-labelledby="channels" className="space-y-3">
        <h2 id="channels" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How reminders reach you
        </h2>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={prefs.inApp}
            onChange={(e) => save({ inApp: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">In the app</span>
            <span className="block text-xs text-muted-foreground">Due reminders appear under the bell.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={prefs.email}
            onChange={(e) => save({ email: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">By email</span>
            <span className="block text-xs text-muted-foreground">
              {prefs.emailAddress ? `To ${prefs.emailAddress}.` : "Your account has no email address, so none will be sent."}
            </span>
          </span>
        </label>
      </section>

      <section aria-labelledby="task-reminders" className="space-y-3">
        <h2 id="task-reminders" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Task due dates
        </h2>
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={prefs.taskReminders}
            onChange={(e) => save({ taskReminders: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">Remind me about tasks&apos; due dates</span>
            <span className="block text-xs text-muted-foreground">
              Every open task with a due date gets a reminder; completing the task or changing its date updates it.
            </span>
          </span>
        </label>

        <div className="space-y-2 rounded-lg border p-3">
          <label htmlFor="lead-days" className="block text-sm font-medium">
            When
          </label>
          <select
            id="lead-days"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
            value={prefs.leadDays}
            disabled={!prefs.taskReminders}
            onChange={(e) => save({ leadDays: Number(e.target.value) })}
          >
            {LEAD_OPTIONS.some((o) => o.value === prefs.leadDays) ? null : (
              <option value={prefs.leadDays}>{prefs.leadDays} days before</option>
            )}
            {LEAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            At 9:00 in <strong>{prefs.timeZone}</strong>. If that time has already passed when a task is added, the
            reminder comes on the due date itself.
          </p>
          {zoneMismatch && (
            <button
              type="button"
              className="text-xs font-medium text-primary underline"
              onClick={() => save({ timeZone: deviceZone })}
            >
              Use this device&apos;s time zone ({deviceZone})
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
