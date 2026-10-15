"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationPreferences } from "@/types";
import { DELETE_ACCOUNT_PHRASE } from "@/domain/account-phrase";

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
            Reminders are best-effort, so keep your own record of important deadlines too. At 9:00 in{" "}
            <strong>{prefs.timeZone}</strong>. If that time has already passed when a task is added, the
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

      <AccountSection />
    </div>
  );
}

/** FR-AUTH-3/4: take your data with you, or delete everything. */
function AccountSection() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: phrase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(typeof data?.error === "string" ? data.error : "Couldn't delete your account.");
      // The session is gone; refresh so nothing cached from the account lingers.
      router.replace("/signin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account.");
      setIsDeleting(false);
    }
  }

  return (
    <section aria-labelledby="your-data" className="space-y-3">
      <h2 id="your-data" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Your data
      </h2>
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">Download your data</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Everything Velora stores about you, as one JSON file: missions, tasks, chats, reminders, document details and the
          activity log.
        </p>
        <a href="/api/account/export" download className="text-sm font-medium text-primary underline">
          Download my data
        </a>
      </div>

      <DocumentAiToggle />

      <div className="rounded-lg border border-destructive/40 p-3">
        <p className="text-sm font-medium">Delete your account</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Permanently deletes your missions, tasks, chats, reminders, documents and their files, and signs you out
          everywhere. This can&apos;t be undone.
        </p>
        {!confirming ? (
          <button type="button" className="text-sm font-medium text-destructive underline" onClick={() => setConfirming(true)}>
            Delete my account…
          </button>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (phrase === DELETE_ACCOUNT_PHRASE) deleteAccount();
            }}
          >
            <label htmlFor="delete-confirm" className="block text-xs">
              Type <strong>{DELETE_ACCOUNT_PHRASE}</strong> to confirm.
            </label>
            <input
              id="delete-confirm"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={phrase}
              autoComplete="off"
              onChange={(e) => setPhrase(e.target.value)}
            />
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={phrase !== DELETE_ACCOUNT_PHRASE || isDeleting}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete everything"}
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => {
                  setConfirming(false);
                  setPhrase("");
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/** Consent for AI to read uploaded documents (docs/08-LEGAL-RISKS.md A3/A4): explicit, and withdrawable here. */
function DocumentAiToggle() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/consent")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && data?.success && setGranted(Boolean(data.data.documentAi)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (granted === null) return null;
  const change = async (value: boolean) => {
    setGranted(value);
    const res = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentAi: value }),
    }).catch(() => null);
    if (!res?.ok) setGranted(!value); // never show a consent that wasn't stored
  };
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <input type="checkbox" className="mt-1 size-4 accent-primary" checked={granted} onChange={(e) => change(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">Let Velora&apos;s AI read documents I upload</span>
        <span className="block text-xs text-muted-foreground">
          Files are sent to Google&apos;s Gemini to read details like expiry dates. Turning this off stops it for new
          uploads; documents already read keep their details until you delete them.
        </span>
      </span>
    </label>
  );
}
