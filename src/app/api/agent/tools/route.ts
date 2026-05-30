import { NextResponse } from "next/server"

const tools = [
  {
    name: "createMission",
    description: "Create a new mission",
    method: "POST",
    path: "/api/tools/createMission",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        overview: { type: "string" },
        nextStep: { type: "string" },
        source: { type: "string", enum: ["onboarding", "agent", "manual"] },
      },
      required: ["title", "overview"],
    },
    outputSchema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, overview: { type: "string" } } },
  },
  {
    name: "createTask",
    description: "Create a task for a mission",
    method: "POST",
    path: "/api/tools/createTask",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        category: { type: "string" },
        dueDate: { type: ["string", "null"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        source: { type: "string", enum: ["agent", "user", "import"] },
      },
      required: ["label"],
    },
    outputSchema: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } } },
  },
  {
    name: "updateTaskStatus",
    description: "Update a task's completed status",
    method: "POST",
    path: "/api/tools/updateTaskStatus",
    inputSchema: { type: "object", properties: { completed: { type: "boolean" } }, required: ["completed"] },
    outputSchema: { type: "object", properties: { id: { type: "string" }, completed: { type: "boolean" } } },
  },
  {
    name: "listEvents",
    description: "List events for a mission",
    method: "GET",
    path: "/api/tools/listEvents?missionId={missionId}",
  },
  {
    name: "listDocuments",
    description: "List documents for a mission",
    method: "GET",
    path: "/api/tools/listDocuments?missionId={missionId}",
  },
  {
    name: "ingestDocument",
    description: "Upload and ingest a document (multipart/form-data, field 'file'). This remains on mission route.",
    method: "POST",
    path: "/api/missions/{missionId}/documents/ingest",
  },
  {
    name: "createMessage",
    description: "Create a chat message for a mission",
    method: "POST",
    path: "/api/tools/createMessage",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        type: { type: "string", enum: ["suggestion", "alert", "update", "reasoning", "user"] },
        text: { type: "string" },
        source: { type: "string", enum: ["agent", "user", "system"] },
      },
      required: ["missionId", "text"],
    },
  },
  {
    name: "generatePlan",
    description: "Generate text from a planning prompt",
    method: "POST",
    path: "/api/tools/generatePlan",
    inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] },
  },
]

export async function GET() {
  return NextResponse.json({ success: true, tools })
}
