"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { MissionRecord } from "@/domain/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatDisplayDate, toDateInputValue } from "@/lib/dates";

const STATUSES = ["On track", "Watch", "At risk"] as const;
type Status = (typeof STATUSES)[number];

/**
 * Mission title block with manual edit and delete (docs/06-DELIVERY-PLAN.md
 * 2.5-6). Everything here works with AI disabled.
 */
export function MissionHeader({
  mission,
  onUpdated,
  onDeleted,
}: {
  mission: MissionRecord;
  onUpdated: (mission: MissionRecord) => void;
  onDeleted: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const targetDate = formatDisplayDate(mission.targetDate);

  if (isEditing) {
    return (
      <MissionEditForm
        mission={mission}
        onCancel={() => setIsEditing(false)}
        onSaved={(updated) => {
          onUpdated(updated);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-start gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{mission.title}</h1>
        <div className="mt-1 flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Edit mission" onClick={() => setIsEditing(true)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete mission" onClick={() => setIsDeleteOpen(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {mission.status ?? "On track"}
        {targetDate && <> · Target date: {targetDate}</>}
      </p>
      {mission.nextStep && <p className="text-sm">Next step: {mission.nextStep}</p>}
      {mission.overview && (
        <p className="line-clamp-3 max-w-prose whitespace-pre-line text-sm text-muted-foreground">{mission.overview}</p>
      )}

      <DeleteMissionDialog
        mission={mission}
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function MissionEditForm({
  mission,
  onCancel,
  onSaved,
}: {
  mission: MissionRecord;
  onCancel: () => void;
  onSaved: (mission: MissionRecord) => void;
}) {
  const [title, setTitle] = useState(mission.title);
  const [status, setStatus] = useState<Status>(mission.status ?? "On track");
  const [targetDate, setTargetDate] = useState(toDateInputValue(mission.targetDate));
  const [nextStep, setNextStep] = useState(mission.nextStep ?? "");
  const [overview, setOverview] = useState(mission.overview ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<MissionRecord>(`/api/missions/${mission.id}`, {
        method: "PATCH",
        body: {
          title: title.trim(),
          status,
          targetDate: targetDate || null,
          nextStep: nextStep.trim(),
          overview: overview.trim(),
        },
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the mission");
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Edit mission" className="flex w-full max-w-xl flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Mission title
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Target date
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Next step
        <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} maxLength={1000} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Overview
        <Textarea value={overview} onChange={(e) => setOverview(e.target.value)} className="min-h-20" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving || !title.trim()}>
          {isSaving ? "Saving..." : "Save mission"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeleteMissionDialog({
  mission,
  open,
  onOpenChange,
  onDeleted,
}: {
  mission: MissionRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await apiFetch(`/api/missions/${mission.id}`, { method: "DELETE" });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the mission");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this mission?</DialogTitle>
          <DialogDescription>
            This permanently deletes &ldquo;{mission.title}&rdquo; with all of its tasks, messages, documents and
            reminders. The activity log keeps a record that it was deleted.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isDeleting}>
              Keep mission
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete mission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
