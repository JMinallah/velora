import { Sparkles, User, Cog } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Who did something, shown the same way everywhere (delivery plan 3-6,
 * 03-AGENT-DESIGN §4.3): Velora's actions are always visually distinct
 * from the user's own.
 */
const ORIGINS = {
  agent: { label: "Velora", icon: Sparkles, className: "border-primary/30 bg-primary/10 text-primary" },
  user: { label: "You", icon: User, className: "border-border bg-muted text-muted-foreground" },
  system: { label: "System", icon: Cog, className: "border-border bg-muted/50 text-muted-foreground" },
} as const;

export function OriginBadge({
  origin,
  className,
  title,
}: {
  origin: "agent" | "user" | "system" | "import";
  className?: string;
  /** Extra context for the tooltip, e.g. "added by Velora". */
  title?: string;
}) {
  const { label, icon: Icon, className: tone } = ORIGINS[origin === "import" ? "system" : origin];
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium leading-4",
        tone,
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
