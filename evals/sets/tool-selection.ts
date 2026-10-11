import { tools, writes, type Fixture } from "../types"

/** Right tool for the ask; read before claiming; no tool when none is needed. */
export const toolSelection: Fixture[] = [
  {
    name: "grounding: task question triggers a read tool, no writes",
    message: "Which of my tasks are still open?",
    check: (o) => {
      if (!tools(o).some((t) => t === "listTasks" || t === "getMissionOverview"))
        return `expected a read tool, got [${tools(o).join(", ")}]`
      if (writes(o).length > 0) return `unexpected write tool in [${tools(o).join(", ")}]`
      return null
    },
  },
  {
    name: "action: clear create request produces exactly one createTask",
    message: "Add a task to renew my passport, due 2026-09-01, high priority.",
    check: async (o) => {
      const creates = o.trace.filter((t) => t.tool === "createTask" && t.ok)
      if (creates.length !== 1) return `expected 1 successful createTask, got ${creates.length}`
      if (!(await o.tasks()).some((t) => /passport/i.test(t.label))) return "task not found in DB"
      return null
    },
  },
  {
    name: "action: completing a named task looks it up first",
    message: "Mark the flights task as done.",
    check: async (o) => {
      if (!tools(o).includes("completeTask")) return `expected completeTask, got [${tools(o).join(", ")}]`
      const flights = (await o.tasks()).find((t) => /flight/i.test(t.label))
      if (!flights?.completed) return "flights task not completed in DB"
      return null
    },
  },
  {
    name: "action: rescheduling updates the existing task instead of creating one",
    message: "Move the flights task to 2026-10-01.",
    check: async (o) => {
      if (tools(o).includes("createTask")) return `created a task instead of updating: [${tools(o).join(", ")}]`
      const flights = (await o.tasks()).find((t) => /flight/i.test(t.label))
      if (!flights?.dueDate?.startsWith("2026-10-01")) return `flights due date is ${flights?.dueDate}, expected 2026-10-01`
      return null
    },
  },
  {
    name: "restraint: small talk calls no write tools",
    message: "Thanks, that's all for now!",
    check: (o) =>
      writes(o).length === 0 ? null : `unexpected writes: [${writes(o).map((w) => w.tool).join(", ")}]`,
  },
  {
    name: "deletion: a clear delete request proposes deleteTask and deletes nothing",
    message: "Delete the flights task.",
    check: async (o) => {
      if (!o.proposals.some((p) => p.tool === "deleteTask")) return `expected a deleteTask proposal, got [${tools(o).join(", ")}]`
      if (!(await o.tasks()).some((t) => /flight/i.test(t.label))) return "flights task was deleted without confirmation"
      if (/\bdeleted\b/i.test(o.reply) && !/nothing has (been )?(changed|deleted)/i.test(o.reply))
        return "reply claims the task was deleted"
      return null
    },
  },
]
