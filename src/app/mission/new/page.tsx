"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Manual mission creation (docs/06-DELIVERY-PLAN.md 2.5-5). Never calls the
 * LLM: the app must be fully usable with AI disabled or down. Onboarding links
 * here ("Plan it myself") and falls back here when AI planning is unavailable,
 * pre-filling the fields through the query string.
 */
function NewMissionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title, setTitle] = useState(() => (searchParams.get("title") ?? "").slice(0, 200));
  const [overview, setOverview] = useState(() => searchParams.get("overview") ?? "");
  const [targetDate, setTargetDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          overview: overview.trim() || undefined,
          targetDate: targetDate || undefined,
          source: "manual",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not create the mission");
      router.push(`/mission/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the mission");
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Plan it yourself</CardTitle>
        <CardDescription>
          Create the mission now and add tasks as you go. You can bring in the AI later, or never.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Mission title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Move from Nairobi to Seoul"
              maxLength={200}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            What&apos;s changing? <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea
              value={overview}
              onChange={(event) => setOverview(event.target.value)}
              placeholder="A few lines of context: why, what matters most, known constraints."
              className="min-h-24 resize-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Target date <span className="font-normal text-muted-foreground">(optional)</span>
            <Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSaving || !title.trim()}>
            {isSaving ? "Creating..." : "Create mission"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Prefer a generated plan?{" "}
            <Link href="/onboarding" className="underline underline-offset-4">
              Plan with AI
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function NewMissionPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      {/* useSearchParams needs a Suspense boundary for static rendering. */}
      <Suspense fallback={null}>
        <NewMissionForm />
      </Suspense>
    </div>
  );
}
