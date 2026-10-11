import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { RISK_LABEL, type RiskLevel } from "@/domain/risk";

const STYLE: Record<RiskLevel, { icon: typeof CheckCircle2; className: string }> = {
  "on-track": { icon: CheckCircle2, className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  "at-risk": { icon: AlertTriangle, className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  "off-track": { icon: OctagonAlert, className: "border-destructive/40 bg-destructive/10 text-destructive" },
};

/** Computed mission risk (FR-MSN-5). Icon + words, never colour alone. */
export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const { icon: Icon, className: tone } = STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tone,
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {RISK_LABEL[level]}
    </span>
  );
}
