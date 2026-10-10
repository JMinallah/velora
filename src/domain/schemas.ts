import { z } from "zod"

/**
 * Input schemas shared by the REST routes and agent tools. Anything a client
 * or the model sends passes through one of these before reaching the domain
 * layer; ownership and origin fields (id, userId, source, createdAt) are never
 * part of an input schema — the server assigns them.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const isoDateTime = z.string().datetime({ offset: true })

/** "2026-09-12" or a full ISO 8601 datetime. Rejects free text and impossible dates like 2026-02-30. */
export const isoDate = z.string().refine(
  (s) => {
    if (DATE_ONLY.test(s)) {
      const d = new Date(`${s}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
    }
    return isoDateTime.safeParse(s).success
  },
  { message: "must be an ISO date (YYYY-MM-DD) or ISO datetime" }
)

const priority = z.enum(["low", "medium", "high"])

export const missionCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  // Optional: a mission created by hand may start as just a title.
  overview: z.string().trim().max(20_000).optional(),
  nextStep: z.string().max(1000).optional(),
  targetDate: isoDate.nullable().optional(),
  // "agent" origin is assigned server-side, never claimed by a client.
  source: z.enum(["onboarding", "manual"]).optional(),
})

export const missionPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().max(300),
    phase: z.string().max(100),
    status: z.enum(["On track", "Watch", "At risk"]),
    overview: z.string().max(20_000),
    nextStep: z.string().max(1000),
    targetDate: isoDate.nullable(),
  })
  .partial()

export const taskCreateSchema = z.object({
  label: z.string().trim().min(1).max(300),
  category: z.string().max(100).optional(),
  dueDate: isoDate.nullable().optional(),
  priority: priority.optional(),
})

export const taskPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    category: z.string().max(100),
    dueDate: isoDate.nullable(),
    priority,
    completed: z.boolean(),
  })
  .partial()

export const reminderCreateSchema = z.object({
  missionId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  details: z.string().max(1000).optional(),
  dueAt: isoDate,
  taskId: z.string().min(1).optional(),
  channel: z.enum(["in-app", "email", "push"]).optional(),
})

export const messageCreateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
})
