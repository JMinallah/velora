"use client";

import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Undoable = { eventId: string; description: string; at: string };

/**
 * Undo for Velora's most recent change in this mission (FR-AGT-6). Refuses —
 * with an explanation — when the user has edited the record since.
 */
export function UndoBar({
  missionId,
  refreshKey,
  onUndone,
}: {
  missionId: string;
  /** Changes whenever a chat turn completes, so the bar re-checks. */
  refreshKey: number;
  onUndone: (description: string) => void;
}) {
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchUndoable = useCallback(async (): Promise<Undoable | null> => {
    try {
      const res = await fetch(`/api/missions/${missionId}/undo`);
      const data = await res.json().catch(() => null);
      return res.ok && data?.success ? data.data : null;
    } catch {
      return null;
    }
  }, [missionId]);

  // Re-check after every chat turn; a new turn also makes an old "Undone…" note stale.
  useEffect(() => {
    let cancelled = false;
    fetchUndoable().then((next) => {
      if (cancelled) return;
      setUndoable(next);
      setNote(null);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchUndoable, refreshKey]);

  if (!undoable && !note) return null;

  const undo = async () => {
    if (!undoable) return;
    setIsBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: undoable.eventId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setNote(`Undone: ${data.data.undid}`);
        setUndoable(data.data.next);
        onUndone(data.data.undid);
      } else {
        setNote(typeof data?.error === "string" ? data.error : "Couldn't undo that.");
        setUndoable(await fetchUndoable());
      }
    } catch {
      setNote("Couldn't reach the server — nothing was changed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Undo Velora's last change">
      {undoable && (
        <>
          <span>
            Velora&apos;s last change: <span className="text-foreground">{undoable.description}</span>
          </span>
          <Button size="xs" variant="outline" onClick={undo} disabled={isBusy}>
            <Undo2 /> {isBusy ? "Undoing..." : "Undo"}
          </Button>
        </>
      )}
      {note && (
        <span role="status" className="basis-full">
          {note}
        </span>
      )}
    </div>
  );
}
