"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { Message, PendingActionStatus } from "@/types";
import { Button } from "@/components/ui/button";

export type ConfirmationEffect = { kind: "task-deleted"; taskId: string } | { kind: "mission-deleted" };

const STATUS_TEXT: Record<Exclude<PendingActionStatus, "pending">, string> = {
  executed: "Done.",
  rejected: "Cancelled — nothing was changed.",
  expired: "This confirmation expired — nothing was changed. Ask again if you still want it.",
  failed: "This couldn't be done — nothing was changed.",
};

/**
 * A destructive action Velora proposed (docs/03-AGENT-DESIGN.md §5). Nothing
 * happens until the user confirms here; the server executes only with this
 * card's single-use nonce, and only the arguments it stored.
 */
export function ConfirmationCard({
  message,
  missionId,
  onDecided,
}: {
  message: Message;
  missionId: string;
  onDecided: (actionId: string, status: PendingActionStatus, effect?: ConfirmationEffect) => void;
}) {
  const action = message.action;
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Re-render once a minute so an unanswered card notices it has expired.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!action) return null;
  const expired = action.status === "pending" && new Date(action.expiresAt).getTime() <= now;
  const status: PendingActionStatus = expired ? "expired" : action.status;

  const decide = async (decision: "confirm" | "reject") => {
    setIsBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/pending-actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: action.nonce, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        if (data.data.receipt) setNote(`✓ ${data.data.receipt}`);
        onDecided(action.id, data.data.status, data.data.effect);
      } else if (res.status === 410) {
        onDecided(action.id, "expired");
      } else if (data?.code === "already_decided" && data.status) {
        onDecided(action.id, data.status === "executing" ? "pending" : data.status);
      } else {
        setNote(typeof data?.error === "string" ? data.error : "Something went wrong — nothing was changed.");
        if (data?.code === "action_failed") onDecided(action.id, "failed");
      }
    } catch {
      setNote("Couldn't reach the server — nothing was changed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Confirm action"
      className="flex w-full gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <p className="font-medium">{action.summary}</p>
        {status === "pending" ? (
          <>
            <p className="text-muted-foreground">
              Velora proposed this. Nothing is deleted unless you confirm. Expires{" "}
              {new Date(action.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => decide("confirm")} disabled={isBusy}>
                {isBusy ? "Working..." : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("reject")} disabled={isBusy}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground" role="status">
            {STATUS_TEXT[status]}
          </p>
        )}
        {note && <p role="alert">{note}</p>}
      </div>
    </div>
  );
}
