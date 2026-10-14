"use client";

import { Sparkles } from "lucide-react";
import { formatLocalTime, useAiStatus } from "@/lib/use-ai-status";

/**
 * Says plainly when AI features are unavailable (NFR-PERF-4, NFR-REL-1),
 * and that everything else still works.
 */
export function AiStatusBanner() {
  const status = useAiStatus();
  if (!status || status.available) return null;

  const message =
    status.reason === "daily-limit"
      ? `Velora's AI has reached today's free limit and is paused until ${status.resumesAt ? formatLocalTime(status.resumesAt) : "tomorrow"}.`
      : "Velora's AI features are switched off right now.";

  return (
    <div role="status" aria-label="AI status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {message} Everything else works as usual: you can create missions and add, edit and complete tasks by hand.
      </p>
    </div>
  );
}
