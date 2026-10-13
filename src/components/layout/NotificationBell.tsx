"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";

type Notification = {
  id: string;
  missionId: string;
  title: string;
  details?: string;
  kind?: "custom" | "task-due";
  taskDueDate?: string;
  sentAt?: string;
  dueAt: string;
  read?: boolean;
};

const REFRESH_MS = 2 * 60 * 1000;

/**
 * The in-app inbox (FR-REM-1): reminders the dispatcher has delivered in the
 * app. Refreshes every couple of minutes and when the tab regains focus.
 */
export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Couldn't load notifications");
      setItems(data.data.items ?? []);
      setUnread(data.data.unread ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the first fetch's state updates don't run inside the effect body.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  async function markAllRead() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Couldn't mark as read");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread((count) => Math.max(0, count - ids.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mark as read");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Notifications</h4>
          {unread > 0 && (
            <Button variant="link" size="sm" className="text-xs" onClick={markAllRead}>
              Mark all as read
            </Button>
          )}
        </div>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              href={`/mission/${n.missionId}`}
              className={`flex items-start gap-3 rounded-md p-2 text-sm hover:bg-secondary ${n.read ? "" : "bg-secondary/50"}`}
            >
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">{n.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {n.kind === "task-due" && n.taskDueDate
                    ? `Due ${formatDisplayDate(n.taskDueDate)}`
                    : (n.details ?? formatDisplayDate(n.sentAt ?? n.dueAt))}
                </span>
              </span>
            </Link>
          ))}
          {!isLoading && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No notifications yet. Reminders show up here when they&apos;re due.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
