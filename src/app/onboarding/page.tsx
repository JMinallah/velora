"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Here you would typically send the data to your backend
    // For now, we'll just navigate to the generating page
    router.push("/mission/generating");
  };

  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Velora</CardTitle>
          <CardDescription>
            Let's start by defining your mission. Describe the life transition
            you're navigating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Textarea
              placeholder="For example: 'I’m moving from Uganda to South Korea for university in 3 months. I need to handle my visa, find housing, and manage my budget.'"
              className="min-h-[120px] resize-none"
            />
            <Button type="submit" className="w-full">
              Generate My Transition Plan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
