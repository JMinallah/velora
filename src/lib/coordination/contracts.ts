export type CreateMissionInput = {
  title: string
  subtitle?: string
  overview: string
  nextStep: string
  source?: "onboarding" | "agent" | "manual"
}

export type CreateTaskInput = {
  missionId: string
  category: string
  label: string
  dueDate?: string | null
  priority?: "low" | "medium" | "high"
  source?: "agent" | "user" | "import"
}

export type UpdateTaskStatusInput = {
  missionId: string
  taskId: string
  completed: boolean
}

export type ToolResult<T> = {
  success: boolean
  data?: T
  error?: string
}
