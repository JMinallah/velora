export type ExtractedData = {
  title: string;
  data: Record<string, string>;
};

export type Message = {
  id: string;
  userId: string;
  missionId?: string;
  type: "suggestion" | "alert" | "update" | "reasoning" | "user" | "confirmation" | "replan";
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
  /** type "replan": a re-plan the agent proposed, reviewed on its own page. */
  replan?: ReplanCardView;
};

export type ReplanCardView = { id: string; summary: string };

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
  /** Ids of tasks in the same mission that must be done first. */
  dependsOn?: string[];
  /** Plan phase this task belongs to, e.g. "Before you go". */
  phase?: string;
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
  /** AI-extracted description (FR-DOC-2): unverified until the user confirms it. */
  extraction?: DocumentExtractionView;
  createdAt: string;
};

export type DocumentExtractionView = {
  status: "done" | "failed";
  documentType?: string;
  title?: string;
  fields: { label: string; value: string }[];
  issueDate?: string | null;
  expiryDate?: string | null;
  containsInstructions?: boolean;
  /** False until the user confirms (or corrects) the extracted details. */
  verified: boolean;
  promptVersion?: string;
  model?: string;
  extractedAt: string;
  verifiedAt?: string;
};

export type ReminderChannel = "in-app" | "email";

/**
 * A reminder and its delivery state (delivery plan 6-1). Lifecycle:
 * scheduled → sending → sent | failed; a failed send goes back to scheduled
 * with a later nextAttemptAt until attempts run out. "skipped" means every
 * channel was off at send time; "cancelled" means the reminder no longer
 * applied (e.g. its task was completed or re-dated).
 */
export type Reminder = {
  id: string;
  userId: string;
  missionId: string;
  taskId?: string;
  /** "task-due" reminders are derived from a task's due date (6-2); absent means made by the user or agent. */
  kind?: "custom" | "task-due";
  /** task-due only: the due date this reminder was scheduled for. */
  taskDueDate?: string;
  title: string;
  details?: string;
  dueAt: string;
  /** Legacy: delivery now follows the user's notification preferences. */
  channel?: "in-app" | "email" | "push";
  status?: "scheduled" | "sending" | "sent" | "failed" | "skipped" | "cancelled";
  /** Delivery attempts so far (each claim by the dispatcher is one). */
  attempts?: number;
  /** Retry backoff: not claimed again before this time. */
  nextAttemptAt?: string;
  /** When the current "sending" claim was taken; a stale claim is re-claimable. */
  claimedAt?: string;
  /** Channels that have received this reminder (never sent twice). */
  delivered?: ReminderChannel[];
  sentAt?: string;
  lastError?: string;
  read?: boolean;
  createdAt: string;
  updatedAt?: string;
};

/** One delivery attempt on one channel — the dispatch log (FR-REM-2). */
export type ReminderDispatch = {
  id: string;
  userId: string;
  missionId: string;
  reminderId: string;
  /** The dispatcher run that made the attempt. */
  runId: string;
  attempt: number;
  channel: ReminderChannel | "none";
  outcome: "sent" | "failed" | "skipped" | "cancelled";
  /** Why a send failed or was skipped. Never contains message content or addresses. */
  reason?: string;
  /** The email provider's message id. */
  providerId?: string;
  at: string;
};

export type NotificationPreferences = {
  inApp: boolean;
  email: boolean;
  /** Remind about tasks' due dates automatically. */
  taskReminders: boolean;
  /** How many days before a task's due date its reminder fires (0 = the day itself). */
  leadDays: number;
  /** IANA zone; task reminders fire at 09:00 local time. */
  timeZone: string;
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
    | "document-deleted"
    | "reminder-created"
    | "reminder-due"
    | "reminder-sent"
    | "reminder-failed"
    | "reminder-cancelled"
    | "risk-updated"
    | "replan-generated"
    | "action-proposed"
    | "action-rejected"
    | "change-undone"
    | "mission-accepted"
    | "replan-accepted";
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
