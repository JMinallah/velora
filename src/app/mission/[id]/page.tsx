"use client";

import { AiMessage } from "@/components/AiMessage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Message, TaskCategory } from "@/types";

const initialTasks: TaskCategory = {
  "Visa & Documents": [
    { id: "task-1", label: "Apply for Student Visa", completed: false, dueDate: "2026-06-15" },
    { id: "task-2", label: "Gather University Admission Documents", completed: true, dueDate: "2026-05-30" },
    { id: "task-3", label: "Submit Proof of Financial Sponsorship", completed: false, dueDate: "2026-06-10" },
  ],
  "Finances": [
    { id: "task-4", label: "Pay First Semester Tuition Fees", completed: false, dueDate: "2026-07-01" },
    { id: "task-5", label: "Open a South Korean Bank Account", completed: false, dueDate: "2026-08-20" },
  ],
  "Travel & Housing": [
    { id: "task-6", label: "Book Flight to Seoul", completed: false, dueDate: "2026-07-15" },
    { id: "task-7", label: "Arrange for University Dormitory", completed: false, dueDate: "2026-06-25" },
  ],
};

const feedMessages: Message[] = [
    { id: "msg-1", type: "reasoning", text: "Based on your 3-month timeline, I've prioritized visa-related tasks as they often have the longest processing times.", timestamp: "May 22, 2026, 10:00 AM" },
    { 
      id: "msg-5", 
      type: "update", 
      text: "I've analyzed your 'acceptance_letter.pdf' and updated your plan. A new task has been added to your finances.", 
      timestamp: "May 22, 2026, 11:30 AM",
      extractedData: {
        title: "acceptance_letter.pdf",
        data: {
          "University": "Seoul National University",
          "Program": "MSc Computer Science",
          "Tuition Deadline": "2026-07-01",
          "Reporting Date": "2026-08-25",
        }
      }
    },
    { id: "msg-3", type: "alert", text: "Your visa application should be submitted within the next 10 days to avoid potential processing delays.", timestamp: "May 22, 2026, 10:05 AM" },
    { id: "msg-4", type: "suggestion", text: "Consider looking into student travel insurance. I can help you find some options if you'd like.", timestamp: "May 22, 2026, 10:15 AM" },
];

export default function MissionPage() {
  const [tasks, setTasks] = useState(initialTasks);

  const handleTaskChange = (taskId: string, completed: boolean) => {
    const newTasks = { ...tasks };
    for (const category in newTasks) {
      const taskIndex = newTasks[category].findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        newTasks[category][taskIndex].completed = completed;
        break;
      }
    }
    setTasks(newTasks);
  };

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {/* AI Coordination Feed */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">
            Mission: Relocate to South Korea
            </h1>
            <p className="text-muted-foreground">
            Here is your AI-powered transition plan.
            </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>AI Coordination Feed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {feedMessages.map((message) => (
              <AiMessage key={message.id} message={message} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        <Card>
            <CardHeader>
                <CardTitle>Your Tasks</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {Object.entries(tasks).map(([category, taskList]) => (
                <div key={category}>
                    <h3 className="text-lg font-semibold mb-2">{category}</h3>
                    <div className="flex flex-col gap-3">
                    {taskList.map((task) => (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-md bg-secondary/50">
                        <Checkbox 
                            id={task.id} 
                            checked={task.completed} 
                            onCheckedChange={(checked) => handleTaskChange(task.id, !!checked)}
                            className="mt-1" 
                        />
                        <div className="grid gap-0.5">
                            <label htmlFor={task.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {task.label}
                            </label>
                            <p className="text-xs text-muted-foreground">
                            Due: {task.dueDate}
                            </p>
                        </div>
                        </div>
                    ))}
                    </div>
                </div>
                ))}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
