# Velora Development Plan

Velora is a mission coordination assistant for life transitions. For the Google Cloud Rapid Agent Hackathon, the project should present a production-ready agent architecture with clear orchestration, tool use, memory, grounding, and deployable backend services.

The core story is:

Frontend in Next.js.
Agent orchestration in Google Cloud Agent Builder.
Reasoning powered by Gemini through the agent platform.
Durable memory in MongoDB Atlas.
Custom actions and integrations served from Cloud Run.
Optional grounding through documents and search indexes.

## Hackathon Alignment

### What Judges Should See

- A real agent workflow, not a plain chat wrapper.
- Tool calling that changes state, not just generated text.
- Long-lived memory across sessions and missions.
- Grounded answers from uploaded files and indexed context.
- A production-shaped deployment path using Google Cloud services.
- A polished product experience that makes the agent behavior obvious.

### Core Product Principles

- Keep the implementation believable and shippable.
- Prefer managed Google Cloud building blocks where they help the demo.
- Make the agent proactive, but not overcomplicated.
- Show clear separation between UI, orchestration, tools, and state.
- Treat every demo action as something a real coordination product would need.

## How We Will Work

The build should follow a strict order so we always have something stable to wire into the next layer.

1. Define the data model and system contracts.
2. Build persistence and backend tool endpoints.
3. Add one complete mission flow end to end.
4. Introduce Agent Builder orchestration on top of that flow.
5. Add document grounding and proactive replanning.
6. Polish the UI and demo path once the behavior is stable.

If a later layer depends on an earlier one, we do not jump ahead. The goal is a reliable product, not a collection of disconnected features.

## Current Status

### Done

- [x] Core dashboard UI and flat layout direction
- [x] Mission timeline UI and responsive shell
- [x] Client-side navigation for header and sidebar
- [x] Internal chat scrolling and viewport-safe layout
- [x] Dashboard chat send flow
- [x] Mission chat send flow
- [x] Gemini API integration for dashboard chat
- [x] Gemini API integration for mission timeline chat
- [x] Shared Gemini helper layer for reuse
- [x] Dedicated transition plan API route
- [x] Onboarding flow that generates a plan and hands it off to missions
- [x] Basic persistence handoff via session storage
- [x] Error handling for transient Gemini failures
- [x] MongoDB Atlas helpers and connection (dev `.env.local` support)
- [x] Mission, task, message, document, and event persistence helpers
- [x] Seed script for initial missions and tasks
- [x] Mission events API and dedicated events page with filters
- [x] Configurable event retention/indexes
- [x] Onboarding now creates a mission and initial tasks

### In Progress

- [ ] Global style refinement for the final dashboard look
- [ ] Remove any remaining unused card styling
- [ ] Make the onboarding result more mission-like and structured
- [ ] Replace more prototype text with product-grade copy

### Recently Delivered

- Backend: MongoDB integration, `src/lib/mongodb/*` helpers, seed script, and events logging.
- API: Missions, tasks, messages, documents, and events endpoints.
- UI: Mission page now reads from APIs and persists tasks/messages/documents, with a dedicated events page.
- Setup: event retention now uses a TTL index with `EVENT_RETENTION_DAYS`.
- Integration hardening: fixed tool-contract mismatch (`createMission` now documented and tested with `overview`; `createTask` with `label`) and resolved lint blockers in mission/task and document ingestion modules.
- Added dedicated authenticated tool execution endpoint (`/api/tools/[tool]`) for Agent Builder calls, plus API-key gating via `TOOLS_API_KEY` and updated integration tester coverage.

Recent changes (pre-Agent Builder)

- Document ingestion pipeline implemented (`/api/missions/{id}/documents/ingest`), file storage under `public/uploads`, background extraction worker at `src/lib/documents/ingest.ts` (plain text, optional `pdf-parse` and `tesseract.js` support).
- Tools manifest endpoint added: `GET /api/agent/tools` listing tool contracts for Agent Builder ([`src/app/api/agent/tools/route.ts`](src/app/api/agent/tools/route.ts)).
- Local integration tester script added: `scripts/test_tools.mjs` to exercise manifest, create mission, create task, and list events.
- Agent Builder guidance added in `AGENT_BUILDER.md` describing contracts, usage notes, and security considerations.

### Next Up

- [ ] Document upload pipeline for extracted context
- [ ] Agent Builder-backed orchestration layer
- [ ] Tool execution endpoints for mission actions
- [ ] Lightweight replanning logic for overdue or blocked work
- [ ] Adaptive reminder system
- [ ] Cloud Run deployment path for backend tools and APIs

- [x] Secure tool auth and unified tool endpoint (`/api/tools/[tool]`)
- [x] Basic user registration and login (JWT)

## Execution Tracker

This is the working order we should follow and mark off as it ships.

### Milestone 1: Foundation and Contracts

Goal: define the product state clearly before adding agent behavior.

- [ ] Finalize the mission data model
- [ ] Define collections for missions, tasks, messages, reminders, documents, and events
- [ ] Define tool contracts for all state-changing actions
- [ ] Decide which fields are required, optional, and derived
- [ ] Write the minimal validation rules for each object
- [ ] Identify the first demo scenario we will support end to end

#### Exact Files To Create Next

These are the first backend files/modules we should add before wiring Agent Builder.

- `src/lib/mongodb/client.ts` - MongoDB connection helper and cached client access.
- `src/lib/mongodb/models.ts` - Shared TypeScript schema objects and collection names.
- `src/lib/mongodb/missions.ts` - Mission read/write helpers.
- `src/lib/mongodb/tasks.ts` - Task read/write helpers.
- `src/lib/mongodb/messages.ts` - Mission conversation persistence helpers.
- `src/lib/mongodb/reminders.ts` - Reminder persistence helpers.
- `src/lib/mongodb/documents.ts` - Document metadata and extracted text helpers.
- `src/lib/mongodb/events.ts` - Event log helper for mission state changes.
- `src/lib/coordination/contracts.ts` - Tool input/output contracts and validation shapes.
- `src/lib/coordination/schema.ts` - Canonical mission, task, document, reminder, and event schema definitions.
- `src/lib/coordination/mappers.ts` - Converters between database records and UI-friendly objects.
- `src/app/api/missions/route.ts` - Mission list and create endpoint.
- `src/app/api/missions/[id]/route.ts` - Mission detail, update, and status endpoint.
- `src/app/api/missions/[id]/tasks/route.ts` - Task create and list endpoint.
- `src/app/api/missions/[id]/messages/route.ts` - Mission message history endpoint.
- `src/app/api/missions/[id]/documents/route.ts` - Document attach and retrieval endpoint.
- `src/app/api/missions/[id]/events/route.ts` - Mission events retrieval endpoint.
- `src/app/api/tools/[tool]/route.ts` - Tool execution endpoint for the agent layer.

#### Draft Schema Objects

These are the first canonical objects the backend should support.

```ts
type MissionRecord = {
  id: string;
  title: string;
  subtitle: string;
  phase: string;
  status: "On track" | "Watch" | "At risk";
  overview: string;
  nextStep: string;
  createdAt: string;
  updatedAt: string;
  source: "onboarding" | "agent" | "manual";
};

type TaskRecord = {
  id: string;
  missionId: string;
  category: string;
  label: string;
  completed: boolean;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  source: "agent" | "user" | "import";
  createdAt: string;
  updatedAt: string;
};

type MessageRecord = {
  id: string;
  missionId: string;
  type: "suggestion" | "alert" | "update" | "reasoning" | "user";
  text: string;
  timestamp: string;
  extractedData?: {
    title: string;
    data: Record<string, string>;
  };
  source: "agent" | "user" | "system";
};

type DocumentRecord = {
  id: string;
  missionId: string;
  name: string;
  mimeType: string;
  storageUrl: string;
  extractedText: string;
  summary: string;
  extractedFields: Record<string, string>;
  createdAt: string;
};

type ReminderRecord = {
  id: string;
  missionId: string;
  taskId?: string;
  title: string;
  details: string;
  dueAt: string;
  channel: "in-app" | "email" | "push";
  status: "scheduled" | "sent" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

type EventRecord = {
  id: string;
  missionId: string;
  type:
    | "mission-created"
    | "mission-updated"
    | "task-created"
    | "task-updated"
    | "document-attached"
    | "reminder-created"
    | "risk-updated"
    | "replan-generated";
  actor: "user" | "agent" | "system";
  payload: Record<string, unknown>;
  createdAt: string;
};
```

#### Draft Tool Contract Objects

These are the first agent-facing tool payloads we should support.

```ts
type CreateMissionInput = {
  title: string;
  subtitle?: string;
  overview: string;
  nextStep: string;
  source?: "onboarding" | "agent" | "manual";
};

type CreateTaskInput = {
  missionId: string;
  category: string;
  label: string;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high";
  source?: "agent" | "user" | "import";
};

type UpdateTaskStatusInput = {
  missionId: string;
  taskId: string;
  completed: boolean;
};

type UpdateTimelineInput = {
  missionId: string;
  changes: Array<{
    taskId: string;
    dueDate?: string | null;
    priority?: "low" | "medium" | "high";
    completed?: boolean;
  }>;
};

type AnalyzeRiskInput = {
  missionId: string;
  reason?: string;
};

type GenerateReminderInput = {
  missionId: string;
  taskId?: string;
  title: string;
  details: string;
  dueAt: string;
  channel?: "in-app" | "email" | "push";
};

type ReplanMissionInput = {
  missionId: string;
  trigger: "deadline-moved" | "task-blocked" | "new-document" | "manual";
};

type IngestDocumentInput = {
  missionId: string;
  name: string;
  mimeType: string;
  storageUrl: string;
  extractedText: string;
};

type ToolResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

#### Required Validation Rules

- `missionId`, `taskId`, and `id` values must be non-empty strings.
- `title`, `label`, `overview`, and `nextStep` must be non-empty.
- `dueDate` and `dueAt` must be either a valid ISO string or `null` where allowed.
- Status fields must use the allowed literal values only.
- Tool handlers must reject unknown fields when they would change state unexpectedly.
- Every write operation should stamp `createdAt` and `updatedAt` in UTC ISO format.
- Every tool response should return a consistent `success` envelope.

#### First Demo Scenario

Use one mission lifecycle as the first end-to-end demo:

1. User starts onboarding.
2. The app creates a mission record.
3. The app creates initial tasks from the onboarding result.
4. The agent or tool layer updates one task.
5. The UI refreshes from persisted state.
6. The user uploads a document and sees extracted data attached to the mission.
7. The agent generates one grounded follow-up recommendation.

### Milestone 2: Durable Backend

Goal: make mission state persistent and reliable.

- [ ] Add MongoDB Atlas connection helper
- [ ] Add environment variable handling for database credentials
- [ ] Implement mission create/read/update flows
- [ ] Implement task create/read/update flows
- [ ] Implement message storage for mission conversations
- [ ] Implement reminder storage and retrieval
- [ ] Implement event logging for state changes

### Milestone 3: Tool Layer

Goal: expose the actions the agent will use.

- [ ] createMission()
- [ ] createTask()
- [ ] updateTaskStatus()
- [ ] updateTimeline()
- [ ] analyzeRisk()
- [ ] generateReminder()
- [ ] replanMission()
- [ ] ingestDocument()
- [ ] Return predictable success and error responses for every tool
- [ ] Add basic request validation and safe defaults

### Milestone 4: One End-to-End Flow

Goal: prove the full product loop before expanding scope.

- [ ] Create a sample mission from onboarding
- [ ] Persist that mission in MongoDB
- [ ] Show the mission in the UI
- [ ] Create at least one task from the agent or tool layer
- [ ] Update the task and reflect the change in the UI
- [ ] Store and display mission messages
- [ ] Verify state survives refresh

### Milestone 5: Agent Builder Orchestration

Goal: make Agent Builder the brain of the coordination workflow.

- [ ] Define the primary Velora agent
- [ ] Write the agent instructions and behavioral rules
- [ ] Connect the agent to mission tools
- [ ] Ensure the agent can read mission state before acting
- [ ] Ensure the agent can update mission state through tools
- [ ] Keep the UI as a bridge, not the orchestrator

### Milestone 6: Grounding and Document Intelligence

Goal: let the agent use actual mission inputs.

- [ ] Add secure file upload handling
- [ ] Extract text from uploaded documents
- [ ] Store document metadata and extracted content
- [ ] Attach documents to the relevant mission
- [ ] Let the agent cite document-derived context in recommendations
- [ ] Surface extracted deadlines and action items in the UI

### Milestone 7: Proactive Behavior

Goal: make the system feel alive and helpful between chats.

- [ ] Add task risk scoring
- [ ] Add overdue task detection
- [ ] Add deadline move detection
- [ ] Add automatic replanning when mission state changes
- [ ] Add reminder generation from deadlines and task status
- [ ] Add in-app notification presentation

### Milestone 8: Production Readiness

Goal: make the project deployable and reviewable.

- [ ] Deploy backend tools on Cloud Run
- [ ] Store secrets in Secret Manager
- [ ] Add basic logging for agent actions and tool calls
- [ ] Add error handling and fallback paths
- [ ] Add a simple health check or readiness check
- [ ] Document local setup and deployment steps
- [ ] Confirm the app works with real environment variables only

### Milestone 9: Demo Polish

Goal: make the experience easy to understand in a live review.

- [ ] Tighten copy across onboarding, mission, and chat
- [ ] Polish loading, empty, and error states
- [ ] Make the demo path obvious from first run to mission resolution
- [ ] Validate the mobile layout
- [ ] Run a final cross-device check
- [ ] Prepare a short demo script

## Tracking Board

Use this section to mark progress as the implementation moves forward.

### Now

- [ ] Finalize the mission data model
- [ ] Define tool contracts
- [ ] Choose the first end-to-end demo flow

### Next

- [ ] Add MongoDB Atlas integration
- [ ] Build the first mission and task APIs
- [ ] Persist onboarding output as mission state

### Later

- [ ] Wire in Agent Builder orchestration
- [ ] Add document grounding
- [ ] Add proactive replanning and reminders
- [ ] Deploy backend tools on Cloud Run

## Definition Of Done

The project is ready for submission when all of the following are true:

- The agent can read mission state and call tools to change it.
- Mission data persists in MongoDB Atlas.
- At least one document can be uploaded and used as grounding.
- The app can generate or update tasks based on mission changes.
- The backend tools run through a deployable path such as Cloud Run.
- The UI clearly shows what the agent decided and what changed.
- The demo can be completed from onboarding to mission update without manual repair.

## Target Architecture

### Frontend

- Next.js dashboard and mission views.
- Fast, readable, demo-friendly interface.
- Forms, chat, onboarding, document upload, and mission inspection.

### Agent Layer

- Google Cloud Agent Builder as the orchestration surface.
- Gemini as the reasoning model inside that platform.
- Managed agent instructions for goals, policies, and tool selection.

### Memory Layer

- MongoDB Atlas for missions, tasks, reminders, documents, and conversation history.
- Stable IDs for mission state so the agent can resume context.
- Structured records for deadlines, risks, dependencies, and outcomes.

### Tool and Backend Layer

- Cloud Run services for custom tool endpoints.
- Tool contracts for create task, update mission, recompute timeline, analyze risk, and generate reminder.
- Secret Manager for API credentials and partner keys.

### Grounding Layer

- Uploaded documents and extracted text.
- Mission state stored in MongoDB.
- Optional indexed knowledge source for search and retrieval.

## Implementation Phases

### Phase 1: Production Foundation

Goal: keep the product stable enough to build on.

- [x] Store Gemini API key in local env for prototype use
- [x] Create shared Gemini client wrapper
- [x] Add `/api/chat` for dashboard chat
- [x] Add `/api/plan` for transition-plan generation
- [x] Connect onboarding to plan generation
- [x] Connect mission timeline chat to Gemini
- [ ] Clean up copy and loading states so the app feels intentional
- [ ] Finalize route and component boundaries for agent integration

### Phase 2: Durable Memory

Goal: preserve mission context across sessions.

- [ ] Add MongoDB Atlas connection helper
- [ ] Create collections for missions, tasks, messages, reminders, and documents
- [ ] Persist onboarding plans as mission seeds
- [ ] Store mission chat history per mission
- [ ] Track state changes as structured events

### Phase 3: Agent Builder Orchestration

Goal: make the app visibly agentic.

- [ ] Define the primary Velora agent in Agent Builder
- [ ] Map mission workflows to agent instructions and tool calls
- [ ] Route high-value actions through the agent instead of direct UI logic
- [ ] Keep the UI as a bridge to the agent, not the brain itself
- [ ] Use Gemini through the platform rather than as a standalone wrapper in the final story

### Phase 4: Tool Calling and Actions

Goal: make agent decisions change product state.

- [ ] createTask()
- [ ] updateTaskStatus()
- [ ] updateTimeline()
- [ ] analyzeRisk()
- [ ] generateReminder()
- [ ] replanMission()

Each tool should read or update a real store so the behavior is visible in the UI.

### Phase 5: Document Intelligence and Grounding

Goal: turn uploads into usable coordination data.

- [ ] Add secure upload handling
- [ ] Extract document text for grounding and mission context
- [ ] Save extracted deadlines, names, action items, and references
- [ ] Surface extracted data in the mission feed
- [ ] Let the agent cite grounded mission inputs during recommendations

### Phase 6: Proactive Coordination

Goal: make the product feel alive between chat sessions.

- [ ] Evaluate task risk on load or refresh
- [ ] Flag overdue or blocked tasks
- [ ] Reprioritize tasks when deadlines move
- [ ] Generate follow-up suggestions automatically
- [ ] Trigger in-app reminders from stored state and deadlines

### Phase 7: Deployment and Production Readiness

Goal: show the project can exist beyond a demo.

- [ ] Deploy custom tool services on Cloud Run
- [ ] Store secrets in Secret Manager
- [ ] Document environment variables and setup steps
- [ ] Add basic operational logs for tool execution and agent actions
- [ ] Keep data access scoped and minimal for each tool
- [ ] Make failure states graceful and recoverable

### Phase 8: Polish and Demo

Goal: make the flow easy to understand in a live review.

- [ ] Tighten copy across onboarding and mission views
- [ ] Polish loading, empty, and error states
- [ ] Make the demo flow obvious from onboarding to mission view
- [ ] Verify the mobile experience
- [ ] Final cross-device check

## Recommended Hackathon Partners

These are the most useful optional integrations if you want to strengthen the submission.

- MongoDB Atlas: best fit for mission memory, timelines, reminders, and state history.
- Elastic: strong option for document search, retrieval, and grounding.
- Arize: useful if you want observability, evaluation, or trace analysis for agent behavior.
- Dynatrace: useful if you want production monitoring and service visibility for backend tools.
- GitLab: useful if you want developer workflow automation or issue-to-task coordination.
- Fivetran: useful only if you want to demonstrate external data synchronization into the memory layer.

If you want to keep the demo tight, MongoDB Atlas and Elastic are the strongest pair. If you want a more enterprise-looking story, add Arize or Dynatrace for observability.

## Immediate Next Actions

1. Lock the mission schema and tool contracts.
2. Build MongoDB persistence for missions, tasks, and messages.
3. Add one tool endpoint that visibly changes mission state.
4. Wire the UI to read from stored mission state.
5. Only then move Agent Builder onto those stable APIs.

## What Is Real Today

- Dashboard chat sends to Gemini.
- Mission chat sends to Gemini.
- Onboarding generates a transition plan.
- The code is split into reusable helper modules.
- The current experience is intentionally lightweight so it can be expanded safely.

## What Is Still Simulated

- Long-term memory in a database
- Automatic replanning loop
- Background reminders
- Document extraction pipeline
- Agent Builder orchestration
- Cloud Run tool execution

## Near-Term Milestone

Build the MongoDB-backed coordination memory layer, then introduce Agent Builder as the primary orchestration layer on top of that stable data model.

Once the memory and tool surfaces are stable, wire in document grounding, replanning, and reminders so the app demonstrates a full agent loop instead of a stateless chat experience.

//tKZIctKFybkD3R17
//joviaminallah_db_user
// [REDACTED] Remove all inline credentials. Use env vars via `.env.local` or Secret Manager.
