gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
 --platform managed \
 --allow-unauthenticated \
 --set-env-vars "MONGODB_DB=$MONGODB_DB,GEMINI_MODEL=$GEMINI_MODEL,EVENT_RETENTION_DAYS=90" \
 --set-secrets "MONGODB_URI=MONGODB_URI:latest,TOOLS_API_KEY=TOOL_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GCS_BUCKET=GCS_BUCKET:latest"

Agent Builder integration notes

Goal

- Provide a small, well-defined set of HTTP tools the Agent Builder can call to inspect and modify application state.

Tools manifest

- Endpoint: `GET /api/agent/tools`
- Returns a JSON list of tools with: `name`, `description`, `method`, `path`, and optional `inputSchema`/`outputSchema`.
- Tool execution base: `/api/tools/[tool]` (JSON body for POST, query params for GET reads).

Primary tool contracts (summary)

- `createMission` — `POST /api/missions` { title, overview, subtitle?, nextStep?, source? }
- `createTask` — `POST /api/missions/{missionId}/tasks` { missionId, label, category?, dueDate?, priority?, source? }
- `createMission` — `POST /api/tools/createMission` { title, overview, subtitle?, nextStep?, source? }
- `createTask` — `POST /api/tools/createTask` { missionId, label, category?, dueDate?, priority?, source? }
- `updateTaskStatus` — `POST /api/tools/updateTaskStatus` { missionId, taskId, completed }
- `listEvents` — `GET /api/tools/listEvents?missionId=...`
- `listDocuments` — `GET /api/tools/listDocuments?missionId=...`
- `ingestDocument` — `POST /api/missions/{missionId}/documents/ingest` (multipart form 'file')
- `createMessage` — `POST /api/tools/createMessage` { missionId, text, type?, source? }
- `generatePlan` — `POST /api/tools/generatePlan` { prompt }

Usage notes

- The agent should treat the tools as authoritative operations that mutate mission state and emit events.
- `ingestDocument` stores the uploaded file in GCS when configured, or `public/uploads` locally, and triggers extraction for text.
- All mutation endpoints return `{ success: true, data: ... }` on success.

Security

- Tool endpoints support API-key auth via `TOOLS_API_KEY`.
- If `TOOLS_API_KEY` is set, provide `x-tools-api-key`, `x-api-key`, or `Authorization: Bearer <key>`.
- For local testing, leave `TOOLS_API_KEY` unset.

Next steps

- Add authentication middleware for tool endpoints.
- Harden ingestion worker (virus scanning, file size limits, storage to GCS).
- Deploy tools to Cloud Run and register their URLs in Agent Builder.

## Detailed Agent Builder Instructions

Purpose

- Provide the agent (hosted in Google Cloud Agent Builder) a clear, deterministic way to inspect and modify Velora mission state using HTTP tools.
- The agent must prefer calling the provided tools rather than attempting to guess or write directly to the database.

Tool discovery

- The agent should call `GET /api/agent/tools` to retrieve the canonical manifest of tools, input shapes, and example usage.

Authentication

- For local testing set `TOOLS_API_KEY` in the Agent Builder tool configuration and include header `x-tools-api-key: <TOOLS_API_KEY>` on each request.
- In production prefer service-to-service auth (Cloud IAM or signed service account token) or provide a long-lived JWT. The server accepts:
  - `x-tools-api-key` header (preferred simple key)
  - `x-api-key` header (legacy compatibility)
  - `Authorization: Bearer <JWT>` where the JWT `sub` is a valid Velora user id.

Tool invocation

- Use the unified endpoint `POST /api/tools/{tool}` for JSON-based tool calls. Body must be a JSON object matching the tool's input shape.
- For file uploads (documents) use the mission-specific route `POST /api/missions/{missionId}/documents/ingest` with multipart/form-data field `file`. The unified `/api/tools` endpoint does not accept binary uploads.
- Always treat tool responses as canonical. The server returns `{ success: boolean, data?: any, error?: string }`.

Idempotency & retries

- Where possible include an `idempotencyKey` string in the request body so the server (or the caller) can deduplicate retries.
- On transient failures (5xx or network), retry with exponential backoff up to 3 times.
- On client errors (4xx), do not retry — surface the error to the operator and stop the plan step.

Error handling rules for the agent

- If a tool call returns `success: false`, the agent should:
  1.  Record the error context in its reasoning step.

2.  If the error is recoverable (temporary), attempt a single retry after short delay.
3.  If unrecoverable (validation error), abort that action and proceed to the next safe step or request human intervention.

Tool usage examples

- Create mission (JSON via unified endpoint):

  Request:
  POST /api/tools/createMission
  Headers: `x-tools-api-key: <KEY>`
  Body:
  {
  "title": "Move to new city",
  "overview": "Plan and execute relocation within 3 months",
  "subtitle": "Relocation plan",
  "nextStep": "Book movers",
  "source": "agent"
  }

  Expected Response (201):
  {
  "success": true,
  "data": { "id": "xxxx", "title": "Move to new city", "overview": "..." }
  }

- Create task (JSON):

  Request:
  POST /api/tools/createTask
  Body:
  {
  "missionId": "xxxx",
  "label": "Find moving company",
  "category": "Logistics",
  "dueDate": "2026-06-15T00:00:00.000Z",
  "priority": "high"
  }

  Response (201):
  { "success": true, "data": { "id": "task-123", "label": "Find moving company" } }

- Update task status (JSON):

  Request:
  POST /api/tools/updateTaskStatus
  Body: { "missionId": "xxxx", "taskId": "task-123", "completed": true }

  Response:
  { "success": true, "data": { /_ updated task record _/ } }

- Ingest document (file upload):

  Request:
  POST /api/missions/{missionId}/documents/ingest
  Content-Type: multipart/form-data
  Field: `file` (binary)

  Response:
  { "success": true, "data": { "id": "doc-1", "storageUrl": "/uploads/.." } }

  Notes: The route saves the file (GCS if configured), creates a document record and emits a `document-attached` event. Background extraction is kicked off asynchronously; the agent should re-query `GET /api/missions/{missionId}/documents` or `POST /api/tools/listDocuments` to fetch extractedText once available.

Agent behavior and persona

- The Velora agent's job is to coordinate tasks toward a clear mission outcome. Keep behavior conservative:
  - Only create missions/tasks when there's clear evidence and a concrete benefit.
  - Use short, testable actions (createTask, updateTaskStatus, ingestDocument) rather than broad freeform changes.
  - When uncertain, ask a clarifying question via `createMessage` and wait for human input.

Decision-making guidance (short):

- Prioritize actions with low risk and high clarity (e.g., creating follow-up tasks, suggesting deadlines).
- Avoid deleting or bulk-updating tasks without human confirmation.
- If multiple actions are plausible, prefer the smallest action that moves the mission forward.

Few-shot examples (tool call transcripts)

Example 1 — Agent creates mission + two tasks:

System prompt (Agent Builder):
You are Velora, an assistant that helps users plan and execute life transitions. Use tools to persist actions.

Agent reasoning (internal): "User said they want to move. Create mission and add immediate tasks."

Tool call 1 (createMission):
POST /api/tools/createMission
Body: { "title": "Move to Seattle", "overview": "Relocation planning", "nextStep": "Find apartments" }

Tool response: mission id => `m-1`

Tool call 2 (createTask):
POST /api/tools/createTask
Body: { "missionId": "m-1", "label": "Search apartments", "priority": "high" }

Tool response: task id => `t-1`

Tool call 3 (createTask):
POST /api/tools/createTask
Body: { "missionId": "m-1", "label": "Get moving estimates", "priority": "medium" }

Agent final message (created via createMessage):
"I've created a mission 'Move to Seattle' and two initial tasks. Would you like me to set due dates?"

Example 2 — Agent ingests a document and replans:

Tool call: POST /api/missions/{missionId}/documents/ingest (multipart with file)
Server: returns document id and storageUrl; emits `document-uploaded` event.

Agent: Waits for extraction completion (poll `GET /api/tools/listDocuments` or `GET /api/missions/{missionId}/documents`) and analyzes extracted text. If extracted text contains deadlines, create tasks and set due dates accordingly.

Operational notes for Agent Builder configuration

- Configure the tool with the `GET /api/agent/tools` manifest URL so the agent can discover tool names and input shapes programmatically.
- Provide the agent with `TOOL_API_KEY` in the Agent Builder tool secret configuration or use service account authentication that maps to a JWT accepted by Velora.
- Set conservative rate limits to avoid accidental rapid writes during development (e.g., 1 request/sec, burst 5).

Testing guidance

- Use `scripts/test_tools.mjs` to run a quick smoke test locally against a dev server. Example:
  BASE_URL=http://localhost:3000 node scripts/test_tools.mjs

Security & Production

- Replace `TOOL_API_KEY` with a managed secret and prefer authenticated service accounts for production.
- Validate uploaded files server-side and scan for malware before sending to shared storage. Consider adding file size limits and content-type restrictions.

When to call a human

- The agent should create a clarification message (via `createMessage`) instead of taking action when:
  - A proposed task would be destructive or irreversible.
  - There is ambiguity about the user's intent or constraints.

Open items for later

- Add an idempotency and dedupe store for tool calls.
- Add signed URLs for large file uploads directly to GCS (so the agent can upload without routing through the app server).
- Add richer event types for agent reasoning traces (why an action was taken).

---

This document is the canonical guide for the agent's behavior and for mapping tool calls to Velora's API. Keep it in sync with `/api/agent/tools` and `AGENT_BUILDER.md`.
