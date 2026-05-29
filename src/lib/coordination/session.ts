const LATEST_PLAN_KEY = "velora:last-transition-plan"

export function saveLatestTransitionPlan(plan: string) {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(LATEST_PLAN_KEY, plan)
}

export function loadLatestTransitionPlan() {
  if (typeof window === "undefined") return ""
  return window.sessionStorage.getItem(LATEST_PLAN_KEY) ?? ""
}