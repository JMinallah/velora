"use client";

import { useCallback, useEffect, useState } from "react";

export type AiStatus = {
  available: boolean;
  reason: "disabled" | "daily-limit" | null;
  resumesAt?: string;
  usage: { used: number; limit: number; resetsAt: string };
};

/** Fired after anything that may have used AI, so meters refresh. */
export const AI_USAGE_EVENT = "velora:ai-usage";
export const notifyAiUsage = () => window.dispatchEvent(new Event(AI_USAGE_EVENT));

/** AI availability and the user's daily usage (GET /api/ai/status); null until loaded or when signed out. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status");
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok && data?.success ? data.data : null);
    } catch {
      // Unknown is shown as nothing, never as a false "AI is off".
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    window.addEventListener("focus", load);
    window.addEventListener(AI_USAGE_EVENT, load);
    return () => {
      clearTimeout(first);
      window.removeEventListener("focus", load);
      window.removeEventListener(AI_USAGE_EVENT, load);
    };
  }, [load]);
  return status;
}

/** "3:00 AM" in the viewer's own time. */
export function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
