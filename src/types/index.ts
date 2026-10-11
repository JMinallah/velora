export type ExtractedData = {
  title: string;
  data: Record<string, string>;
};

export type Message = {
  id: string;
  userId: string;
  missionId?: string;
  type: "suggestion" | "alert" | "update" | "reasoning" | "user" | "confirmation";
  text: string;
  createdAt: string;
  extractedData?: ExtractedData;
  source?: "agent" | "user" | "system";
  /** Prompt version that produced an agent reply (forensics). */
  promptVersion?: string;
  /** Tool that produced a receipt message. */
  tool?: string;
  /** Groups a chat turn: the user's message, its receipts, the reply, and the events it caused. */
  turnId?: string;
  /** type "confirmation": a destructive action the agent proposed, awaiting the user's decision. */
  action?: ProposedActionView;
};

export type PendingActionStatus = "pending" | "executed" | "rejected" | "expired" | "failed";

/** What the user sees on a confirmation card (and needs to answer it). */
export type ProposedActionView = {
  id: string;
  /** Single-use; required to confirm. Never shown to the model. */
  nonce: string;
  tool: string;
  summary: string;
  status: PendingActionStatus;
  expiresAt: string;
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
  /** The date the transition must be done by, if the user set one (YYYY-MM-DD or ISO). */
  targetDate?: string | null;
  /** Agent settings (FR-TRS-4). Absent means the defaults. */
  settings?: MissionSettings;
  createdAt: string;
  updatedAt: string;
  source?: "onboarding" | "agent" | "manual";
};

/**
 * "standard": Velora's writes apply immediately (visible as receipts, undoable);
 * deletions always need confirmation. "confirm-writes": every change Velora
 * makes waits for the user's confirmation, like deletions do.
 */
export type Autonomy = "standard" | "confirm-writes";
export type MissionSettings = { autonomy: Autonomy };

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
    | "document-updated"
    | "reminder-created"
    | "reminder-due"
    | "risk-updated"
    | "replan-generated"
    | "action-proposed"
    | "action-rejected"
    | "change-undone";
  actor: "user" | "agent" | "system";
  payload: Record<string, unknown>;
  createdAt: string;
  /** Agent changes: the chat turn that caused them (matches Message.turnId). */
  turnId?: string;
  /** Agent changes: the validated tool call that made the change. */
  cause?: { tool: string; args: unknown };
  /** Destructive agent changes: executed only after the user confirmed (03-AGENT-DESIGN §5). */
  confirmedBy?: "user";
  /** Agent writes: how to reverse this change (FR-AGT-6). Never set on user changes. */
  undo?: UndoSnapshot;
};

/**
 * Enough to reverse one agent write exactly. `afterUpdatedAt` is the record's
 * updatedAt right after the change: undo refuses if it has changed since
 * (the user edited the record), so undo never overwrites the user's work.
 */
export type UndoSnapshot =
  | { kind: "delete-task"; taskId: string; label: string; afterUpdatedAt: string }
  | { kind: "restore-task"; taskId: string; label: string; before: Task; afterUpdatedAt: string }
  | { kind: "delete-reminder"; reminderId: string; label: string; afterUpdatedAt: string };
