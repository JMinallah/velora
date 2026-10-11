/**
 * Task dependency graphs ("book movers after signing the lease"). Pure
 * functions, shared by task updates and plan validation (delivery plan 4-2).
 */
export type DependencyNode = { key: string; dependsOn: string[] }

/** A dependency cycle as the keys along it (first key repeated at the end), or null if there is none. */
export function findCycle(nodes: DependencyNode[]): string[] | null {
  const edges = new Map(nodes.map((n) => [n.key, n.dependsOn]))
  const state = new Map<string, "visiting" | "done">()
  const path: string[] = []

  const visit = (key: string): string[] | null => {
    if (state.get(key) === "done") return null
    if (state.get(key) === "visiting") return [...path.slice(path.indexOf(key)), key]
    state.set(key, "visiting")
    path.push(key)
    for (const next of edges.get(key) ?? []) {
      if (!edges.has(next)) continue // unknown keys are reported separately
      const cycle = visit(next)
      if (cycle) return cycle
    }
    path.pop()
    state.set(key, "done")
    return null
  }

  for (const node of nodes) {
    const cycle = visit(node.key)
    if (cycle) return cycle
  }
  return null
}

/**
 * Validates one task's new dependency list against the mission's tasks:
 * no self-dependency, only tasks of this mission, and no cycle. Returns a
 * user-readable problem, or null when valid.
 */
export function dependencyProblem(
  taskId: string,
  dependsOn: string[],
  missionTasks: { id: string; label: string; dependsOn?: string[] }[]
): string | null {
  if (dependsOn.includes(taskId)) return "A task can't depend on itself."
  const known = new Set(missionTasks.map((t) => t.id))
  if (dependsOn.some((id) => !known.has(id))) return "Dependencies must be tasks in this mission."
  const cycle = findCycle(
    missionTasks.map((t) => ({ key: t.id, dependsOn: t.id === taskId ? dependsOn : (t.dependsOn ?? []) }))
  )
  if (!cycle) return null
  const label = (id: string) => missionTasks.find((t) => t.id === id)?.label ?? id
  return `That would create a loop: ${cycle.map(label).join(" → ")}.`
}
