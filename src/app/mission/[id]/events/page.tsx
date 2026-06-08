"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Event } from "@/types";

const EVENT_TYPES = [
  "all",
  "mission-created",
  "mission-updated",
  "task-created",
  "task-updated",
  "document-attached",
  "reminder-created",
  "risk-updated",
  "replan-generated",
] as const;

const EVENT_ACTORS = ["all", "user", "agent", "system"] as const;

function formatEventType(type: string) {
  return type.replace(/-/g, " ");
}

function formatTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

export default function MissionEventsPage() {
  const params = useParams();
  const missionId = params ? String(params.id ?? "") : "";
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<(typeof EVENT_TYPES)[number]>("all");
  const [actorFilter, setActorFilter] = useState<(typeof EVENT_ACTORS)[number]>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/missions/${missionId}/events`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load events");
        }

        if (!cancelled) {
          setEvents(data.data ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load events");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    if (missionId) {
      loadEvents();
    }

    return () => {
      cancelled = true;
    };
  }, [missionId]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...events]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((event) => (typeFilter === "all" ? true : event.type === typeFilter))
      .filter((event) => (actorFilter === "all" ? true : event.actor === actorFilter))
      .filter((event) => {
        if (!query) return true;
        const haystack = `${event.type} ${event.actor} ${JSON.stringify(event.payload)}`.toLowerCase();
        return haystack.includes(query);
      });
  }, [actorFilter, events, search, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Mission events</p>
          <h1 className="text-3xl font-bold tracking-tight">Activity log</h1>
        </div>
        <Link href={`/mission/${missionId}`} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Back to mission
        </Link>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/30 bg-background p-4 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search type, actor, payload..."
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>{type === "all" ? "All types" : formatEventType(type)}</option>
          ))}
        </select>
        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value as typeof actorFilter)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {EVENT_ACTORS.map((actor) => (
            <option key={actor} value={actor}>{actor === "all" ? "All actors" : actor}</option>
          ))}
        </select>
      </div>

      {isLoading ? <div className="rounded-2xl border border-border/20 bg-muted/20 p-4 text-sm text-muted-foreground">Loading events...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}

      <div className="space-y-3">
        {!isLoading && filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-border/20 bg-muted/20 p-4 text-sm text-muted-foreground">No matching events yet.</div>
        ) : null}

        {filteredEvents.map((event) => (
          <div key={event.id} className="rounded-2xl border border-border/20 bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold capitalize">{formatEventType(event.type)}</p>
                <p className="text-xs text-muted-foreground">{event.actor} • {formatTimestamp(event.createdAt)}</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{event.id.slice(0, 8)}</span>
            </div>
            <pre className="mt-3 overflow-auto rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
