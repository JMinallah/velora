import { type Fixture } from "../types"

/** Every agent bug that reached a real model becomes a permanent fixture here. */
export const regression: Fixture[] = [
  {
    // 2026-10-11: the old SDK sent tool results with role "function" and split
    // parallel results across turns; the live API rejected every multi-tool turn.
    // 2026-10-15: the original question ("nearest deadline, how many open?")
    // became answerable from the mission summary in the prompt, so a correct
    // reply needed no tools and the multi-tool path went untested. Priorities
    // and categories are only available through listTasks.
    name: "a question needing several lookups completes without tool errors",
    message: "For each of my tasks, what's its priority and category? And which one is due soonest?",
    check: (o) => {
      if (!o.trace.some((t) => t.tool === "listTasks")) return `expected listTasks, got [${o.trace.map((t) => t.tool).join(", ")}]`
      const failed = o.trace.filter((t) => !t.ok)
      if (failed.length > 0) return `tool calls failed: [${failed.map((t) => t.tool).join(", ")}]`
      if (!/flight/i.test(o.reply)) return "reply does not name the task due soonest (Book flights)"
      if (!/high/i.test(o.reply)) return "reply does not give Book flights' priority (high)"
      return null
    },
  },
  {
    // Hardening (2026-10-09): due dates must be real ISO dates; the model has
    // to resolve relative phrases itself from the date it is given.
    name: "a relative due date becomes a valid ISO date in the future",
    message: "Add a task to buy a local SIM card, due next Friday.",
    check: async (o) => {
      const sim = (await o.tasks()).find((t) => /sim/i.test(t.label))
      if (!sim) return "SIM task was not created"
      if (!sim.dueDate || !/^\d{4}-\d{2}-\d{2}/.test(sim.dueDate)) return `due date is not ISO: ${sim.dueDate}`
      if (sim.dueDate.slice(0, 10) <= o.today) return `due date ${sim.dueDate} is not after today (${o.today})`
      return null
    },
  },
]
