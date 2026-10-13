"use client";

import { useState } from "react";
import { AlertTriangle, BellPlus } from "lucide-react";
import type { DocumentRecord } from "@/domain/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OriginBadge } from "@/components/OriginBadge";
import { formatDisplayDate, renewalReminderDate } from "@/lib/dates";

/**
 * AI-extracted details of a document (FR-DOC-2): visibly marked as
 * unverified until the user confirms or corrects them. Once an expiry date
 * is confirmed, a renewal reminder is *suggested* — never created on its own
 * (FR-DOC-4).
 */
export function DocumentExtraction({
  missionId,
  doc,
  onUpdated,
}: {
  missionId: string;
  doc: DocumentRecord;
  onUpdated: (doc: DocumentRecord) => void;
}) {
  const extraction = doc.extraction;
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState(extraction?.fields ?? []);
  const [expiryDate, setExpiryDate] = useState(extraction?.expiryDate?.slice(0, 10) ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!extraction) return null;
  if (extraction.status === "failed") {
    return <p className="mt-2 text-xs text-muted-foreground">Velora couldn&apos;t read this document.</p>;
  }

  const save = async (body: Record<string, unknown>) => {
    setIsBusy(true);
    setNote(null);
    const res = await fetch(`/api/missions/${missionId}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setIsBusy(false);
    if (res.ok && data?.success) {
      onUpdated(data.data);
      setIsEditing(false);
    } else setNote(typeof data?.error === "string" ? data.error : "Couldn't save.");
  };

  const reminderAt = extraction.verified && extraction.expiryDate ? renewalReminderDate(extraction.expiryDate) : null;
  const addReminder = async () => {
    setIsBusy(true);
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missionId,
        title: `Renew: ${extraction.title ?? doc.name}`,
        details: `Expires ${formatDisplayDate(extraction.expiryDate)}`,
        dueAt: reminderAt,
      }),
    });
    setIsBusy(false);
    setNote(res.ok ? `Reminder set for ${formatDisplayDate(reminderAt)}.` : "Couldn't add the reminder.");
  };

  return (
    <div
      aria-label={`Details of ${doc.name}`}
      className={`mt-2 space-y-2 rounded-md p-2 text-xs ${
        extraction.verified ? "border border-border" : "border border-dashed border-amber-500/60 bg-amber-500/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {extraction.verified ? (
          <span className="font-medium">Confirmed by you</span>
        ) : (
          <>
            <OriginBadge origin="agent" />
            <span className="font-medium text-amber-700 dark:text-amber-400">AI-extracted · unverified</span>
          </>
        )}
        {extraction.title && <span className="text-muted-foreground">— {extraction.title}</span>}
      </div>

      {extraction.containsInstructions && (
        <p role="note" className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          This document contained text addressed to an AI. Velora ignored it — check the document is what you expected.
        </p>
      )}

      {isEditing ? (
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">{f.label}</span>
              <Input
                aria-label={f.label}
                value={f.value}
                onChange={(e) => setFields(fields.map((g, j) => (j === i ? { ...g, value: e.target.value } : g)))}
                className="h-7 text-xs"
              />
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">Expiry date</span>
            <Input type="date" aria-label="Expiry date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="h-7 w-auto text-xs" />
          </label>
          <div className="flex gap-2">
            <Button size="xs" disabled={isBusy} onClick={() => save({ fields: fields.filter((f) => f.value.trim()), expiryDate: expiryDate || null })}>
              Save as correct
            </Button>
            <Button size="xs" variant="outline" disabled={isBusy} onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {extraction.fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
            {extraction.expiryDate && (
              <div className="contents">
                <dt className="text-muted-foreground">Expires</dt>
                <dd>{formatDisplayDate(extraction.expiryDate)}</dd>
              </div>
            )}
          </dl>
          {!extraction.verified && (
            <div className="flex gap-2">
              <Button size="xs" disabled={isBusy} onClick={() => save({})}>
                These are correct
              </Button>
              <Button size="xs" variant="outline" disabled={isBusy} onClick={() => setIsEditing(true)}>
                Correct them
              </Button>
            </div>
          )}
          {reminderAt && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Expires {formatDisplayDate(extraction.expiryDate)} — add a renewal reminder for {formatDisplayDate(reminderAt)}?
              </span>
              <Button size="xs" variant="outline" disabled={isBusy} onClick={addReminder}>
                <BellPlus /> Add reminder
              </Button>
            </div>
          )}
        </>
      )}
      {note && <p role="status">{note}</p>}
    </div>
  );
}
