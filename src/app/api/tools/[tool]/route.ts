import { NextRequest, NextResponse } from "next/server"
import { authorizeToolRequest } from "@/lib/auth/toolsAuth"
import { createEvent, listEventsForMission } from "@/lib/mongodb/events"
import { createMessage } from "@/lib/mongodb/messages"
import { createMission, updateMission, getMission } from "@/lib/mongodb/missions"
import { listDocumentsForMission } from "@/lib/mongodb/documents"
import { createTask, updateTaskStatus, updateTasks, listTasksForMission, getTask, shiftTaskDates } from "@/lib/mongodb/tasks"
import { createReminder } from "@/lib/mongodb/reminders"
import { generateGeminiText } from "@/lib/ai/gemini"

type ToolParams = { params: Promise<{ tool: string }> }

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 })
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized tool request" }, { status: 401 })
}

export async function POST(request: NextRequest, { params }: ToolParams) {
  const auth = await authorizeToolRequest(request)
  if (!auth.ok) return unauthorized()

  const { tool } = await params
  const body = await request.json().catch(() => ({} as Record<string, unknown>))

  try {
    if (tool === "createMission") {
      const title = typeof body.title === "string" ? body.title.trim() : ""
      const overview = typeof body.overview === "string" ? body.overview.trim() : ""
      if (!title || !overview) return badRequest("title and overview required")

      const created = await createMission({
        title,
        overview,
        subtitle: typeof body.subtitle === "string" ? body.subtitle : undefined,
        nextStep: typeof body.nextStep === "string" ? body.nextStep : "",
        source: (body.source as "onboarding" | "agent" | "manual") ?? "agent",
      })

      await createEvent({ missionId: created.id, type: "mission-created", actor: "agent", payload: { title: created.title } }).catch(() => undefined)
      return NextResponse.json({ success: true, data: created }, { status: 201 })
    }

    if (tool === "createTask") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const label = typeof body.label === "string" ? body.label.trim() : ""
      if (!missionId || !label) return badRequest("missionId and label required")

      const created = await createTask({
        missionId,
        label,
        category: typeof body.category === "string" ? body.category : "General",
        dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
        priority: (body.priority as "low" | "medium" | "high") ?? "medium",
        source: (body.source as "agent" | "user" | "import") ?? "agent",
      })

      await createEvent({ missionId, type: "task-created", actor: "agent", payload: { taskId: created.id, label: created.label } }).catch(() => undefined)
      return NextResponse.json({ success: true, data: created }, { status: 201 })
    }

    if (tool === "updateTaskStatus") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const taskId = typeof body.taskId === "string" ? body.taskId : ""
      const completed = body.completed
      if (!missionId || !taskId || typeof completed !== "boolean") return badRequest("missionId, taskId, and completed(boolean) required")

      const updated = await updateTaskStatus(missionId, taskId, completed)
      if (!updated) return NextResponse.json({ success: false, error: "task not found" }, { status: 404 })

      await createEvent({ missionId, type: "task-updated", actor: "agent", payload: { taskId, completed } }).catch(() => undefined)
      return NextResponse.json({ success: true, data: updated })
    }

    if (tool === "createMessage") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const text = typeof body.text === "string" ? body.text : ""
      if (!missionId || !text) return badRequest("missionId and text required")

      const created = await createMessage({
        missionId,
        type: (body.type as "suggestion" | "alert" | "update" | "reasoning" | "user") ?? "reasoning",
        text,
        source: (body.source as "agent" | "user" | "system") ?? "agent",
      })
      return NextResponse.json({ success: true, data: created }, { status: 201 })
    }

    if (tool === "updateTimeline") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const changes = Array.isArray(body.changes) ? body.changes : []
      if (!missionId || changes.length === 0) return badRequest("missionId and changes array required")

      const modifiedCount = await updateTasks(missionId, changes)
      await createEvent({ missionId, type: "mission-updated", actor: "agent", payload: { modifiedCount, reason: "timeline-update" } }).catch(() => undefined)
      return NextResponse.json({ success: true, data: { modifiedCount } })
    }

    if (tool === "analyzeRisk") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      let reason = typeof body.reason === "string" ? body.reason : ""
      if (!missionId) return badRequest("missionId required")

      let status = body.status as "On track" | "Watch" | "At risk"
      
      // If status isn't provided, we analyze the tasks
      if (!status) {
        const tasks = await listTasksForMission(missionId)
        const now = new Date()
        const overdueTasks = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now)
        
        if (overdueTasks.length > 2) {
          status = "At risk"
          reason = reason || `Found ${overdueTasks.length} overdue tasks.`
        } else if (overdueTasks.length > 0) {
          status = "Watch"
          reason = reason || `Found ${overdueTasks.length} overdue tasks.`
        } else {
          status = "On track"
          reason = reason || "All tasks are on schedule."
        }
      }

      const updated = await updateMission(missionId, { status })
      
      await createEvent({ 
        missionId, 
        type: "risk-updated", 
        actor: "agent", 
        payload: { reason: reason || "Agent risk analysis", status } 
      }).catch(() => undefined)

      return NextResponse.json({ success: true, data: updated })
    }

    if (tool === "generateReminder") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const title = typeof body.title === "string" ? body.title : ""
      const dueAt = typeof body.dueAt === "string" ? body.dueAt : ""
      if (!missionId || !title || !dueAt) return badRequest("missionId, title, and dueAt required")

      const created = await createReminder({
        missionId,
        taskId: typeof body.taskId === "string" ? body.taskId : undefined,
        title,
        details: typeof body.details === "string" ? body.details : undefined,
        dueAt,
        channel: (body.channel as "in-app" | "email" | "push") ?? "in-app",
      })

      return NextResponse.json({ success: true, data: created }, { status: 201 })
    }

    if (tool === "replanMission") {
      const missionId = typeof body.missionId === "string" ? body.missionId : ""
      const daysToShift = typeof body.daysToShift === "number" ? body.daysToShift : 0
      const trigger = typeof body.trigger === "string" ? body.trigger : "manual"
      if (!missionId) return badRequest("missionId required")

      const modifiedCount = await shiftTaskDates(missionId, daysToShift)
      
      await createEvent({ 
        missionId, 
        type: "replan-generated", 
        actor: "agent", 
        payload: { trigger, daysToShift, modifiedCount } 
      }).catch(() => undefined)

      return NextResponse.json({ success: true, data: { missionId, trigger, daysToShift, modifiedCount, status: "replanned" } })
    }

    if (tool === "generatePlan") {
      const prompt = typeof body.prompt === "string" ? body.prompt : ""
      if (!prompt) return badRequest("prompt required")

      const response = await generateGeminiText(prompt)
      return NextResponse.json({ success: true, data: { response } })
    }

    return NextResponse.json({ success: false, error: `Unknown tool: ${tool}` }, { status: 404 })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, { params }: ToolParams) {
  const auth = await authorizeToolRequest(request)
  if (!auth.ok) return unauthorized()

  const { tool } = await params
  const url = new URL(request.url)
  const missionId = url.searchParams.get("missionId")

  try {
    if (!missionId) return badRequest("missionId query parameter required")

    if (tool === "listEvents") {
      const data = await listEventsForMission(missionId)
      return NextResponse.json({ success: true, data })
    }

    if (tool === "getMission") {
      const data = await getMission(missionId)
      if (!data) return NextResponse.json({ success: false, error: "mission not found" }, { status: 404 })
      return NextResponse.json({ success: true, data })
    }

    if (tool === "listTasks") {
      const data = await listTasksForMission(missionId)
      return NextResponse.json({ success: true, data })
    }

    if (tool === "getTask") {
      const taskId = url.searchParams.get("taskId")
      if (!taskId) return badRequest("taskId query parameter required")
      const data = await getTask(missionId, taskId)
      if (!data) return NextResponse.json({ success: false, error: "task not found" }, { status: 404 })
      return NextResponse.json({ success: true, data })
    }

    if (tool === "listDocuments") {
      const data = await listDocumentsForMission(missionId)
      return NextResponse.json({ success: true, data })
    }

    return NextResponse.json({ success: false, error: `Unknown tool: ${tool}` }, { status: 404 })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tool query failed",
      },
      { status: 500 }
    )
  }
}
