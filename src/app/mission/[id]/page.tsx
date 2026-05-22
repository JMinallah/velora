import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const tasks = {
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

export default function MissionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Mission: Relocate to South Korea for University
        </h1>
        <p className="text-muted-foreground">
          Here is your generated transition plan. Velora will help you track everything.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(tasks).map(([category, taskList]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{category}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {taskList.map((task) => (
                <div key={task.id} className="flex items-start gap-3">
                  <Checkbox id={task.id} checked={task.completed} className="mt-1" />
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
