import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { Message } from "@/types";
import { Button } from "@/components/ui/button";
import { OriginBadge } from "@/components/OriginBadge";

/** A re-plan Velora proposed (FR-MSN-4). Nothing changes until the user accepts it on the review page. */
export function ReplanCard({ message, missionId }: { message: Message; missionId: string }) {
  if (!message.replan) return null;
  return (
    <div role="group" aria-label="Proposed re-plan" className="flex w-full gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <OriginBadge origin="agent" />
        <p className="font-medium">{message.replan.summary}</p>
        <p className="text-muted-foreground">Nothing has changed yet — review the changes, then accept or reject them.</p>
        <Button asChild size="sm">
          <Link href={`/mission/${missionId}/replan/${message.replan.id}`}>Review changes</Link>
        </Button>
      </div>
    </div>
  );
}
