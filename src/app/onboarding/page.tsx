"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Onboarding (FR-MSN-1): describe a transition, and Velora drafts a plan.
 * The draft is a proposal — the user reviews, edits and accepts it on
 * /plan/[id] before any mission exists (FR-MSN-2). When AI is unavailable,
 * the user is offered manual planning with their text carried over.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [concerns, setConcerns] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Set when AI planning failed or is unavailable: the user is offered manual creation instead.
  const [aiProblem, setAiProblem] = useState<string | null>(null);

  // Carries what the user already typed over to the manual form.
  const manualHref = (() => {
    const params = new URLSearchParams();
    if (goal.trim()) params.set("title", goal.trim());
    const context = [deadline.trim() && `Deadline: ${deadline.trim()}`, concerns.trim()].filter(Boolean).join("\n");
    if (context) params.set("overview", context);
    const query = params.toString();
    return query ? `/mission/new?${query}` : "/mission/new";
  })();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!goal.trim()) return;

    setIsGenerating(true);
    setAiProblem(null);
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          deadline: deadline.trim() || undefined,
          concerns: concerns.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) {
        router.push(`/plan/${data.data.id}`);
        return;
      }
      setAiProblem(
        typeof data?.error === "string" && data?.code
          ? data.error
          : "We couldn't draft a plan right now. You can create the mission yourself and add tasks as you go."
      );
    } catch {
      setAiProblem("We couldn't reach Velora. You can create the mission yourself and add tasks as you go.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full"
      >
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Plan a transition with Velora</CardTitle>
            <CardDescription>
              Describe the change you&apos;re making. Velora drafts a plan for you to review — nothing is saved until
              you accept it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                What are you planning?
                <Textarea
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="e.g. Moving from Nairobi to Seoul for a new job"
                  className="min-h-24 resize-none"
                  maxLength={1000}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Deadline or target date <span className="font-normal text-muted-foreground">(optional)</span>
                <Textarea
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  placeholder="e.g. Start work on 1 December"
                  className="min-h-16 resize-none"
                  maxLength={200}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Risks, blockers or concerns <span className="font-normal text-muted-foreground">(optional)</span>
                <Textarea
                  value={concerns}
                  onChange={(event) => setConcerns(event.target.value)}
                  placeholder="e.g. Moving with a dog; need a work visa"
                  className="min-h-20 resize-none"
                  maxLength={2000}
                />
              </label>
              <Button type="submit" className="w-full" disabled={isGenerating || !goal.trim()}>
                {isGenerating ? "Drafting your plan…" : "Draft my plan"}
              </Button>
              {isGenerating && (
                <p className="text-center text-sm text-muted-foreground" aria-live="polite">
                  This can take up to a minute.
                </p>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link href={manualHref}>Plan it myself (no AI)</Link>
              </Button>
            </form>

            {aiProblem && (
              <div
                role="alert"
                className="mt-6 flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/20 p-4 text-sm"
              >
                <p>{aiProblem}</p>
                <Button asChild className="self-start">
                  <Link href={manualHref}>Create it manually instead</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
