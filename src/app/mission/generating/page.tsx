"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const generatingSteps = [
  "Parsing your mission...",
  "Identifying key milestones...",
  "Generating task dependencies...",
  "Estimating timeline...",
  "Analyzing potential risks...",
  "Finalizing your transition plan...",
];

export default function GeneratingMissionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      setCurrentStep((prevStep) => {
        if (prevStep < generatingSteps.length - 1) {
          return prevStep + 1;
        }
        clearInterval(interval);
        void (async () => {
          try {
            const response = await fetch("/api/missions");
            const data = await response.json().catch(() => ({}));
            const latestMissionId = response.ok && data?.success ? data.data?.[0]?.id : null;

            if (!cancelled) {
              router.push(latestMissionId ? `/mission/${latestMissionId}` : "/onboarding");
            }
          } catch {
            if (!cancelled) {
              router.push("/onboarding");
            }
          }
        })();
        return prevStep;
      });
    }, 1500); // Time per step

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">
          Generating Your Transition Plan
        </h2>
        <p className="text-muted-foreground">
          {generatingSteps[currentStep]}
        </p>
      </div>
    </div>
  );
}
