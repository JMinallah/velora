import { type Fixture } from "../types"

/** Every agent bug that reached a real model becomes a permanent fixture here. */
export const regression: Fixture[] = [
  {
    // 2026-10-11: the old SDK sent tool results with role "function" and split
    // parallel results across turns; the live API rejected every multi-tool turn.
    name: "a question needing several lookups completes without tool errors",
    message: "What's my nearest deadline, and how many tasks do I have open in total?",
    check: (o) => {
      if (o.trace.length === 0) return "expected read tools, got none"
      const failed = o.trace.filter((t) => !t.ok)
      if (failed.length > 0) return `tool calls failed: [${failed.map((t) => t.tool).join(", ")}]`
      if (!/flight/i.test(o.reply)) return "reply does not mention the nearest deadline (Book flights)"
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
