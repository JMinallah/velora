"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { TaskRecord } from "@/domain/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { formatDisplayDate, toDateInputValue } from "@/lib/dates";

type Priority = "low" | "medium" | "high";
const PRIORITIES: Priority[] = ["low", "medium", "high"];

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

/**
 * A mission's tasks with full manual CRUD (docs/06-DELIVERY-PLAN.md 2.5-6):
 * add, complete/reopen, edit, delete. Works with AI disabled; the agent uses
 * the same API through its tools.
 */
export function TaskList({
  missionId,
  tasks,
  onChange,
}: {
  missionId: string;
  tasks: TaskRecord[];
  onChange: (update: (tasks: TaskRecord[]) => TaskRecord[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const replaceTask = (task: TaskRecord) => onChange((cur) => cur.map((t) => (t.id === task.id ? task : t)));

  return (
    <div className="space-y-4">
      <NewTaskForm missionId={missionId} onCreated={(task) => onChange((cur) => [task, ...cur])} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="space-y-3" aria-label="Tasks">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              missionId={missionId}
              task={task}
              onUpdated={replaceTask}
              onDeleted={() => onChange((cur) => cur.filter((t) => t.id !== task.id))}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTaskForm({ missionId, onCreated }: { missionId: string; onCreated: (task: TaskRecord) => void }) {
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const task = await apiFetch<TaskRecord>(`/api/missions/${missionId}/tasks`, {
        method: "POST",
        body: { label: label.trim(), category: "General", priority, dueDate: dueDate || null },
      });
      onCreated(task);
      setLabel("");
      setDueDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the task");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Add task" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="New task"
          aria-label="New task"
          maxLength={300}
          className="min-w-48 flex-1"
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="w-auto"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label="Priority"
          className={selectClass}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={isSaving || !label.trim()}>
          {isSaving ? "Adding..." : "Add"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function TaskRow({
  missionId,
  task,
  onUpdated,
  onDeleted,
  onError,
}: {
  missionId: string;
  task: TaskRecord;
  onUpdated: (task: TaskRecord) => void;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [isBusy, setIsBusy] = useState(false);
  const taskUrl = `/api/missions/${missionId}/tasks/${task.id}`;
  const due = formatDisplayDate(task.dueDate);
  const meta = [task.category, task.priority].filter(Boolean).join(" · ");

  const run = async (action: () => Promise<void>, failure: string) => {
    setIsBusy(true);
    onError(null);
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : failure);
    } finally {
      setIsBusy(false);
    }
  };

  // Optimistic: the checkbox flips immediately and reverts if the save fails.
  const toggleCompleted = (completed: boolean) => {
    onUpdated({ ...task, completed });
    return run(async () => {
      try {
        onUpdated(await apiFetch<TaskRecord>(taskUrl, { method: "PATCH", body: { completed } }));
      } catch (err) {
        onUpdated(task);
        throw err;
      }
    }, "Could not update the task");
  };

  const deleteTask = () =>
    run(async () => {
      await apiFetch(taskUrl, { method: "DELETE" });
      onDeleted();
    }, "Could not delete the task");

  if (mode === "edit") {
    return (
      <li>
        <TaskEditForm
          task={task}
          taskUrl={taskUrl}
          onCancel={() => setMode("view")}
          onSaved={(updated) => {
            onUpdated(updated);
            setMode("view");
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={Boolean(task.completed)}
        disabled={isBusy}
        aria-label={`Done: ${task.label}`}
        onChange={(e) => toggleCompleted(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${task.completed ? "text-muted-foreground line-through" : ""}`}>{task.label}</p>
        <p className="text-sm text-muted-foreground">
          {meta}
          {due && <> · Due {due}</>}
          {task.source === "agent" && <> · added by Velora</>}
        </p>
      </div>
      {mode === "confirm-delete" ? (
        <div className="flex shrink-0 items-center gap-1 text-sm">
          <span>Delete?</span>
          <Button size="sm" variant="destructive" onClick={deleteTask} disabled={isBusy}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={isBusy}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit "${task.label}"`} onClick={() => setMode("edit")}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete "${task.label}"`}
            onClick={() => setMode("confirm-delete")}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

function TaskEditForm({
  task,
  taskUrl,
  onCancel,
  onSaved,
}: {
  task: TaskRecord;
  taskUrl: string;
  onCancel: () => void;
  onSaved: (task: TaskRecord) => void;
}) {
  const [label, setLabel] = useState(task.label);
  const [category, setCategory] = useState(task.category ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [priority, setPriority] = useState<Priority>(task.priority ?? "medium");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<TaskRecord>(taskUrl, {
        method: "PATCH",
        body: { label: label.trim(), category: category.trim() || "General", dueDate: dueDate || null, priority },
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task");
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={`Edit "${task.label}"`} className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Task"
          maxLength={300}
          className="min-w-48 flex-1"
          required
        />
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          placeholder="Category"
          maxLength={100}
          className="w-36"
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="w-auto"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label="Priority"
          className={selectClass}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving || !label.trim()}>
          {isSaving ? "Saving..." : "Save task"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
