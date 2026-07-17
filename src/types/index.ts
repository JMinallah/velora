export type ExtractedData = {
  title: string;
  data: Record<string, string>;
};

export type Message = {
  id: string;
  userId: string;
  missionId?: string;
  type: "suggestion" | "alert" | "update" | "reasoning" | "user";
  text: string;
  createdAt: string;
  extractedData?: ExtractedData;
  source?: "agent" | "user" | "system";
};

export type MissionAction = {
  id: string;
  title: string;
  details: string;
  createdAt: string;
};

export type Task = {
  id: string;
  userId: string;
  missionId: string;
  category: string;
  label: string;
  completed: boolean;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high";
  risk?: "low" | "medium" | "high";
  source?: "agent" | "user" | "import";
  createdAt: string;
  updatedAt: string;
};

export type TaskCategory = {
  [category: string]: Task[];
};

export type Mission = {
  id: string;
  userId: string;
  title: string;
  subtitle?: string;
  phase?: string;
  status?: "On track" | "Watch" | "At risk";
  overview?: string;
  nextStep?: string;
  createdAt: string;
  updatedAt: string;
  source?: "onboarding" | "agent" | "manual";
};

export type Document = {
  id: string;
  userId: string;
  missionId: string;
  name: string;
  mimeType: string;
  storageUrl: string;
  extractedText?: string;
  summary?: string;
  extractedFields?: Record<string, string>;
  createdAt: string;
};

export type Reminder = {
  id: string;
  userId: string;
  missionId: string;
  taskId?: string;
  title: string;
  details?: string;
  dueAt: string;
  channel?: "in-app" | "email" | "push";
  status?: "scheduled" | "sent" | "dismissed";
  read?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type Event = {
  id: string;
  userId: string;
  missionId: string;
  type:
    | "mission-created"
    | "mission-updated"
    | "mission-deleted"
    | "task-created"
    | "task-updated"
    | "task-deleted"
    | "document-attached"
    | "reminder-created"
    | "risk-updated"
    | "replan-generated";
  actor: "user" | "agent" | "system";
  payload: Record<string, unknown>;
  createdAt: string;
};
