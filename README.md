# Velora: Adaptive Life Transition Coordination Agent

An AI-powered agent that helps users navigate complex life transitions by coordinating tasks, managing timelines, and providing intelligent guidance. Built with Next.js, MongoDB, and Google Vertex AI.

## Features

- **AI Agent Integration**: Powered by Google Vertex AI's Reasoning Engines with real-time streaming responses
- **Mission-Based Planning**: Create and manage life transition missions with hierarchical task structures
- **Document Management**: Upload and process documents (PDF, images, text) with OCR and AI extraction
- **Real-Time Events**: Track mission events and actions with a comprehensive event log
- **Risk Analysis**: Monitor mission health with automatic risk assessment
- **Timeline Adjustments**: Intelligently shift task dates when circumstances change
- **MCP Tool Integration**: Leverage Model Context Protocol for extensible tool capabilities
- **RESTful API**: Full OpenAPI specification for tool integrations

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Node.js 20
- **Database**: MongoDB (Atlas)
- **AI**: Google Vertex AI Reasoning Engines, Gemini API
- **Storage**: Google Cloud Storage
- **Deployment**: Google Cloud Run, Cloud Build
- **Protocol**: Model Context Protocol (MCP) for tool communication

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Google Cloud account with:
  - Vertex AI API enabled
  - Cloud Run API enabled
  - Cloud Build API enabled
  - Cloud Secret Manager configured
- MongoDB Atlas account or local MongoDB instance
- Gemini API key from Google AI Studio

### Local Development

1. **Clone and install**:
   ```bash
   git clone <repository>
   cd velora
   npm install
   ```

2. **Set up environment variables**:
   Create `.env.local`:
   ```bash
   # Vertex AI Agent
   AGENT_PROJECT_NUMBER=<your_project_number>
   AGENT_LOCATION=us-west1
   AGENT_RESOURCE_ID=<your_agent_resource_id>

   # Database
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=velora_dev

   # APIs
   GEMINI_API_KEY=<your_gemini_key>
   TOOLS_API_KEY=<generated_api_key>
   JWT_SECRET=<secure_random_string>
   GCS_BUCKET=<your_gcs_bucket>

   # Optional: Public app URL for OpenAPI spec generation
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

4. **Test tools integration**:
   ```bash
   npm run smoke:tools
   ```

5. **Test agent integration**:
   ```bash
   tsx scripts/test_agent_integration.ts
   ```

## Deployment

### Cloud Run Deployment

The project uses Google Cloud Build for CI/CD.

**Deploy to Cloud Run**:
```bash
gcloud builds submit --config cloudbuild.yaml .
```

**Deploy tool service** (optional separate service):
```bash
gcloud builds submit --config cloudbuild.tools.yaml .
```

### Environment Setup (Cloud Run)

Cloud Run environment variables are managed through:
- **Environment Variables**: Set via `--set-env-vars` in Cloud Build
  - `MONGODB_DB`: Database name (default: velora)
  - `AGENT_PROJECT_NUMBER`: Vertex AI project number
  - `AGENT_LOCATION`: Vertex AI location (us-west1)
  - `AGENT_RESOURCE_ID`: Vertex AI agent resource ID

- **Secrets**: Stored in Cloud Secret Manager and referenced via `--set-secrets`
  - `MONGODB_URI`: MongoDB connection string
  - `GEMINI_API_KEY`: Gemini API key
  - `TOOLS_API_KEY`: Internal tools authentication key
  - `JWT_SECRET`: JWT signing secret
  - `GCS_BUCKET`: Google Cloud Storage bucket name

### Authentication

- **Service Account**: Cloud Run uses Application Default Credentials (ADC) for Vertex AI access
- **IAM Role Required**: The Cloud Run service account needs `roles/aiplatform.user`

## API Endpoints

### Agent Chat Interface

**POST /api/session**
Create a new agent session.
```json
{ "userId": "unique-user-id" }
```
Response: `{ "sessionId": "session-uuid" }`

**POST /api/chat**
Send a message to the agent.
```json
{ "message": "text", "sessionId": "uuid", "userId": "user-id" }
```
Response: Streamed text response

### Mission Tools

**GET /api/agent/openapi**
Returns OpenAPI specification for all available tools.

**GET /api/agent/tools**
Returns list of available tool definitions.

**POST /api/tools/createMission**
```json
{ "title": "Move to Korea", "overview": "...", "source": "agent" }
```

**GET /api/tools/getMission?missionId=id**

**POST /api/tools/createTask**
```json
{ "missionId": "id", "label": "Get visa", "category": "Visa", "priority": "high" }
```

**GET /api/tools/listTasks?missionId=id**

**POST /api/tools/updateTaskStatus**
```json
{ "missionId": "id", "taskId": "id", "completed": true }
```

**POST /api/tools/createMessage**
```json
{ "missionId": "id", "text": "...", "type": "suggestion" }
```

**POST /api/tools/analyzeRisk**
```json
{ "missionId": "id", "status": "At risk", "reason": "..." }
```

**POST /api/tools/replanMission**
```json
{ "missionId": "id", "daysToShift": 5 }
```

**POST /api/tools/generateReminder**
```json
{ "missionId": "id", "title": "...", "dueAt": "2026-06-20T10:00:00Z" }
```

### MCP Endpoint

**GET/POST /api/mcp**
Server-Sent Events (SSE) transport for Model Context Protocol. Used by Vertex AI Agent to call tools.

## Hooks

### useVelora

React hook for agent interaction in client components.

```typescript
const { messages, loading, send, ready } = useVelora();

await send("Help me plan my move to South Korea");
```

## Database Schema

### Collections

- **missions**: Main transition plans
  - `title`, `overview`, `subtitle`, `phase`, `status`, `nextStep`
  - `source`: "onboarding" | "agent" | "manual"
  - `createdAt`, `updatedAt`

- **tasks**: Individual action items
  - `missionId`, `label`, `category`, `dueDate`, `priority`
  - `completed`, `source`, `createdAt`

- **messages**: Chat/notes for missions
  - `missionId`, `text`, `type`: "suggestion" | "alert" | "update" | "reasoning" | "user"
  - `source`, `createdAt`

- **events**: Audit trail
  - `missionId`, `type`, `actor`, `payload`, `timestamp`

- **documents**: Uploaded files
  - `missionId`, `filename`, `url`, `contentType`, `uploadedAt`

- **reminders**: Scheduled notifications
  - `missionId`, `taskId`, `title`, `dueAt`, `channel`, `sent`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run lint` - Run ESLint
- `npm run smoke:tools` - Test tool endpoints
- `npm run mcp:dev` - Run MCP server in stdio mode
- `npm run smoke:mcp` - Test MCP server
- `npm run reminders:run` - Execute reminder service

## Security

- **Environment Variables**: All secrets stored in `.env.local` (git-ignored)
- **Cloud Secret Manager**: Production secrets stored in Google Cloud Secret Manager
- **API Keys**: Internal tools API key stored as `TOOLS_API_KEY` secret
- **JWT**: User sessions signed with `JWT_SECRET`
- **CORS**: Configured for safe cross-origin requests
- **No Credentials in Git**: `.gitignore` prevents `.env*` files from being committed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                         │
│                   Next.js App Router                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
        ┌──────────────────┐  ┌──────────────────┐
        │ Frontend Routes  │  │  API Routes      │
        │ /mission/[id]    │  │  /api/chat       │
        │ /documents       │  │  /api/session    │
        │ /onboarding      │  │  /api/tools/*    │
        └────────┬─────────┘  │  /api/mcp        │
                 │            └────────┬─────────┘
                 │                     │
                 └─────────────┬───────┘
                               ▼
                    ┌─────────────────────┐
                    │ Google Vertex AI    │
                    │ Reasoning Engine    │
                    └────────┬────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
            ┌──────────────────┐  ┌──────────────────┐
            │   MCP Tools      │  │  Gemini API      │
            │  /api/mcp        │  │  Text Generation │
            └──────────────────┘  └──────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   ┌─────────────┐        ┌──────────────┐
   │  MongoDB    │        │ Cloud Storage│
   │   Atlas     │        │   (GCS)      │
   └─────────────┘        └──────────────┘
```

## Contributing

This is a hackathon project. For development:

1. Create a feature branch
2. Make changes
3. Test locally with `npm run smoke:tools` and `npm run smoke:mcp`
4. Push and create a pull request

## License

MIT

## Support

For issues and questions, open a GitHub issue or contact the maintainers.

---

**Deployed**: Google Cloud Run  
**Project**: velora-497511  
**Region**: us-central1
