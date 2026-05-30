"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";
import { saveLatestTransitionPlan } from "@/lib/coordination/session";

export default function OnboardingPage() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [concerns, setConcerns] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) return;

    setIsGenerating(true);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: trimmedGoal,
          deadline: deadline.trim(),
          concerns: concerns.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate plan");
      }

      const generatedPlan = data.response || "No plan returned.";
      setPlan(generatedPlan);
      saveLatestTransitionPlan(generatedPlan);

      // Create a mission from the onboarding result
      try {
        const missionRes = await fetch(`/api/missions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedGoal,
            subtitle: deadline.trim() || undefined,
            overview: generatedPlan,
            nextStep: "Review plan and begin execution",
            source: "onboarding",
          }),
        })

        const missionData = await missionRes.json().catch(() => ({}))
        if (!missionRes.ok || !missionData?.success) {
          throw new Error(missionData?.error || "Failed to create mission")
        }

        const mission = missionData.data

        // Create initial tasks by splitting the plan into lines (pick up to 3)
        const lines = generatedPlan.split("\n").map((line: string) => line.trim()).filter(Boolean)
        const initialTasks = lines.slice(0, 3)

        for (const line of (initialTasks.length ? initialTasks : ["Review the generated plan"])) {
          await fetch(`/api/missions/${mission.id}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: line, category: "Initial", priority: "medium" }),
          })
        }

        router.push(`/mission/${mission.id}`)
      } catch (err) {
        console.error("Failed to create mission/tasks from onboarding", err)
        // fallback: go to default mission page
        router.push("/mission/1")
      }
    } catch (error) {
      console.error("Onboarding error:", error);
      setPlan(error instanceof Error ? error.message : "Failed to generate plan.");
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
            <CardTitle className="text-2xl">Welcome to Velora</CardTitle>
            <CardDescription>
              Let&apos;s start by defining your mission. Describe the life transition
              you&apos;re navigating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="What are you trying to coordinate?"
                className="min-h-24 resize-none"
              />
              <Textarea
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                placeholder="Deadline or target date"
                className="min-h-16 resize-none"
              />
              <Textarea
                value={concerns}
                onChange={(event) => setConcerns(event.target.value)}
                placeholder="Any risks, blockers, or concerns?"
                className="min-h-20 resize-none"
              />
              <Button type="submit" className="w-full" disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate My Transition Plan"}
              </Button>
            </form>

            {plan && (
              <div className="mt-6 rounded-lg border border-border/20 bg-muted/20 p-4 text-sm whitespace-pre-wrap">
                {plan}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
