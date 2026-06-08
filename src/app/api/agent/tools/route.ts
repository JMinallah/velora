import { NextResponse } from "next/server"

const tools = [
  {
    name: "createMission",
    description: "Create a new transition mission (e.g., 'Move to South Korea'). Use this when a user first describes their goal.",
    method: "POST",
    path: "/api/tools/createMission",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The main goal of the mission" },
        subtitle: { type: "string", description: "A brief sub-heading" },
        overview: { type: "string", description: "A detailed description of the transition" },
        nextStep: { type: "string", description: "The very next immediate action" },
        source: { type: "string", enum: ["onboarding", "agent", "manual"] },
      },
      required: ["title", "overview"],
    },
  },
  {
    name: "getMission",
    description: "Retrieve the full details of a specific mission, including its overview and current status.",
    method: "GET",
    path: "/api/tools/getMission?missionId={missionId}",
  },
  {
    name: "createTask",
    description: "Add a new task to a mission. Use this to build out the transition plan step-by-step.",
    method: "POST",
    path: "/api/tools/createTask",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        label: { type: "string", description: "What needs to be done" },
        category: { type: "string", description: "e.g., Visa, Housing, Finance" },
        dueDate: { type: ["string", "null"], description: "ISO date string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        source: { type: "string", enum: ["agent", "user", "import"] },
      },
      required: ["missionId", "label"],
    },
  },
  {
    name: "listTasks",
    description: "List all tasks associated with a mission. Use this to see the current progress and plan.",
    method: "GET",
    path: "/api/tools/listTasks?missionId={missionId}",
  },
  {
    name: "getTask",
    description: "Get details of a specific task.",
    method: "GET",
    path: "/api/tools/getTask?missionId={missionId}&taskId={taskId}",
  },
  {
    name: "updateTaskStatus",
    description: "Mark a task as completed or incomplete.",
    method: "POST",
    path: "/api/tools/updateTaskStatus",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        taskId: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["missionId", "taskId", "completed"],
    },
  },
  {
    name: "listEvents",
    description: "View the history of actions and changes (events) for a mission.",
    method: "GET",
    path: "/api/tools/listEvents?missionId={missionId}",
  },
  {
    name: "listDocuments",
    description: "List all documents uploaded for this mission.",
    method: "GET",
    path: "/api/tools/listDocuments?missionId={missionId}",
  },
  {
    name: "createMessage",
    description: "Post a message to the mission chat. Use 'suggestion' for advice, 'alert' for risks, and 'reasoning' to explain your actions.",
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
    name: "updateTimeline",
    description: "Bulk update task dates or priorities. Use this when a delay in one task affects others.",
    method: "POST",
    path: "/api/tools/updateTimeline",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              dueDate: { type: ["string", "null"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              completed: { type: "boolean" },
            },
            required: ["id"],
          },
        },
      },
      required: ["missionId", "changes"],
    },
  },
  {
    name: "analyzeRisk",
    description: "Update the mission's risk level (On track, Watch, At risk) based on current progress.",
    method: "POST",
    path: "/api/tools/analyzeRisk",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        status: { type: "string", enum: ["On track", "Watch", "At risk"] },
        reason: { type: "string", description: "Why the risk level changed" },
      },
      required: ["missionId", "status"],
    },
  },
  {
    name: "generateReminder",
    description: "Schedule a reminder for the user.",
    method: "POST",
    path: "/api/tools/generateReminder",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        taskId: { type: "string" },
        title: { type: "string" },
        details: { type: "string" },
        dueAt: { type: "string", description: "ISO date string for when the reminder should fire" },
        channel: { type: "string", enum: ["in-app", "email", "push"] },
      },
      required: ["missionId", "title", "dueAt"],
    },
  },
  {
    name: "replanMission",
    description: "Trigger a full replanning of the mission timeline. Use this when a major change occurs (like a visa rejection) to shift all future tasks.",
    method: "POST",
    path: "/api/tools/replanMission",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string" },
        daysToShift: { type: "number", description: "Number of days to shift all incomplete tasks (positive for delay, negative for earlier)" },
        trigger: { type: "string", enum: ["deadline-moved", "task-blocked", "new-document", "manual"] },
      },
      required: ["missionId", "daysToShift"],
    },
  },
]

export async function GET() {
  return NextResponse.json({ success: true, tools })
}
