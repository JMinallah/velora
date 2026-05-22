import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-2xl font-bold tracking-tight">
          You have no active mission.
        </h3>
        <p className="text-sm text-muted-foreground">
          Get started by creating a new transition plan.
        </p>
        <Link href="/onboarding">
          <Button className="mt-4">Create Mission</Button>
        </Link>
      </div>
    </div>
  );
}
