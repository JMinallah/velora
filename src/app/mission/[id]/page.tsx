"use client";

import { AiMessage } from "@/components/AiMessage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Message, TaskCategory } from "@/types";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

const initialFeedMessages: Message[] = [
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
  const [feedMessages, setFeedMessages] = useState(initialFeedMessages);

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

  const handleSimulateChange = () => {
    // 1. Create a new reasoning message
    const newMessage: Message = {
        id: `msg-${Date.now()}`,
        type: "reasoning",
        text: "A delay in your visa application has been detected. I've adjusted the downstream 'Book Flight to Seoul' task to mitigate risk.",
        timestamp: new Date().toLocaleString(),
    };

    // 2. Update the flight booking task's due date
    const newTasks = { ...tasks };
    const travelTaskIndex = newTasks["Travel & Housing"].findIndex(t => t.id === "task-6");
    if (travelTaskIndex !== -1) {
        newTasks["Travel & Housing"][travelTaskIndex].dueDate = "2026-07-25"; // Pushed back 10 days
    }

    // 3. Update state
    setFeedMessages([newMessage, ...feedMessages]);
    setTasks(newTasks);
  };

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
      {/* AI Coordination Feed */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="flex items-start justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                Mission: Relocate to South Korea
                </h1>
                <p className="text-muted-foreground">
                Here is your AI-powered transition plan.
                </p>
            </div>
            <Button onClick={handleSimulateChange} variant="outline">Simulate Change</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>AI Coordination Feed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AnimatePresence>
              {feedMessages.map((message) => (
                <motion.div
                  key={message.id}
                  layout
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <AiMessage message={message} />
                </motion.div>
              ))}
            </AnimatePresence>
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
                <motion.div
                  variants={{
                    hidden: { opacity: 0 },
                    show: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.2,
                      },
                    },
                  }}
                  initial="hidden"
                  animate="show"
                >
                  {Object.entries(tasks).map(([category, taskList]) => (
                  <motion.div key={category} variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.3 }}>
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
                  </motion.div>
                  ))}
                </motion.div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
