import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") || url.host
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")
  const baseUrl = `${protocol}://${host}`

  const successResponse = {
    description: "Successful operation",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { type: "object" }
          }
        }
      }
    }
  }

  const spec = {
    openapi: "3.0.0",
    info: {
      title: "Velora Agent Tools",
      description: "Tools for the Velora Transition Coordination Agent",
      version: "1.0.0",
    },
    servers: [
      {
        url: baseUrl,
        description: "Velora API Server",
      },
    ],
    paths: {
      "/api/tools/createMission": {
        post: {
          operationId: "createMission",
          summary: "Create a new transition mission",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
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
              },
            },
          },
          responses: { "201": successResponse, "200": successResponse },
        },
      },
      "/api/tools/getMission": {
        get: {
          operationId: "getMission",
          summary: "Get mission details",
          parameters: [
            { name: "missionId", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": successResponse },
        },
      },
      "/api/tools/createTask": {
        post: {
          operationId: "createTask",
          summary: "Add a task to a mission",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    label: { type: "string" },
                    category: { type: "string" },
                    dueDate: { type: "string", format: "date-time" },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                  },
                  required: ["missionId", "label"],
                },
              },
            },
          },
          responses: { "201": successResponse, "200": successResponse },
        },
      },
      "/api/tools/listTasks": {
        get: {
          operationId: "listTasks",
          summary: "List tasks for a mission",
          parameters: [
            { name: "missionId", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": successResponse },
        },
      },
      "/api/tools/updateTaskStatus": {
        post: {
          operationId: "updateTaskStatus",
          summary: "Update task completion status",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    taskId: { type: "string" },
                    completed: { type: "boolean" },
                  },
                  required: ["missionId", "taskId", "completed"],
                },
              },
            },
          },
          responses: { "200": successResponse },
        },
      },
      "/api/tools/createMessage": {
        post: {
          operationId: "createMessage",
          summary: "Post a message to the mission chat",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    type: { type: "string", enum: ["suggestion", "alert", "update", "reasoning", "user"] },
                    text: { type: "string" },
                  },
                  required: ["missionId", "text"],
                },
              },
            },
          },
          responses: { "201": successResponse, "200": successResponse },
        },
      },
      "/api/tools/analyzeRisk": {
        post: {
          operationId: "analyzeRisk",
          summary: "Update mission risk status",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    status: { type: "string", enum: ["On track", "Watch", "At risk"] },
                    reason: { type: "string" },
                  },
                  required: ["missionId"],
                },
              },
            },
          },
          responses: { "200": successResponse },
        },
      },
      "/api/tools/replanMission": {
        post: {
          operationId: "replanMission",
          summary: "Shift mission timeline by a number of days",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    daysToShift: { type: "number" },
                    trigger: { type: "string" },
                  },
                  required: ["missionId", "daysToShift"],
                },
              },
            },
          },
          responses: { "200": successResponse },
        },
      },
      "/api/tools/generateReminder": {
        post: {
          operationId: "generateReminder",
          summary: "Create a reminder for a mission or task",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    missionId: { type: "string" },
                    taskId: { type: "string" },
                    title: { type: "string" },
                    details: { type: "string" },
                    dueAt: { type: "string", format: "date-time" },
                  },
                  required: ["missionId", "title", "dueAt"],
                },
              },
            },
          },
          responses: { "201": successResponse, "200": successResponse },
        },
      },
    },
  }

  return NextResponse.json(spec)
}
