"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function OnboardingPage() {
  const router = useRouter();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // In a real app, you'd create a mission and get an ID.
    // For this prototype, we'll navigate to a static mission ID.
    router.push("/mission/123");
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
                placeholder="For example: 'I’m moving from Uganda to South Korea for university in 3 months. I need to handle my visa, find housing, and manage my budget.'"
                className="min-h-30 resize-none"
              />
              <Button type="submit" className="w-full">
                Generate My Transition Plan
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
