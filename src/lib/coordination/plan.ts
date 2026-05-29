export type TransitionPlanInput = {
  goal: string
  deadline?: string
  concerns?: string
}

export function buildTransitionPlanPrompt(input: TransitionPlanInput) {
  const lines = [
    `User goal: ${input.goal}`,
    input.deadline ? `Deadline: ${input.deadline}` : null,
    input.concerns ? `Concerns: ${input.concerns}` : null,
    "",
    "Generate a practical transition roadmap with:",
    "- a concise summary",
    "- prioritized tasks",
    "- risks",
    "- recommendations",
    "- the next 3 actions the user should take",
  ]

  return lines.filter(Boolean).join("\n")
}