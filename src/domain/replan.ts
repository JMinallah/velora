import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb, withTransaction } from "@/adapters/db"
import { COLLECTIONS, type MissionRecord, type TaskRecord } from "./collections"
import { emitEvent } from "./events"
import { findCycle } from "./dependencies"
import { isoDate } from "./schemas"

/**
 * Re-planning (FR-MSN-4, delivery plan 4-5): when circumstances change, the
 * agent proposes a *diff* — tasks to add, change and remove. Nothing changes
 * until the user accepts; accepting applies the whole diff in one
 * transaction, and refuses if any affected task was edited since the
 * proposal. Rejecting leaves the mission byte-identical.
 */
const newKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "new task keys are lowercase slugs")

export const replanDiffSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  targetDate: isoDate.nullable().optional(),
  add: z
    .array(
      z.object({
        key: newKey,
        label: z.string().trim().min(1).max(300),
        dueDate: isoDate.nullable().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        phase: z.string().trim().max(100).optional(),
        /** Existing task ids and/or keys of other added tasks. */
        dependsOn: z.array(z.string().min(1)).max(10).default([]),
      })
    )
    .max(30)
    .default([]),
  change: z
    .array(
      z.object({
        taskId: z.string().min(1),
        label: z.string().trim().min(1).max(300).optional(),
        dueDate: isoDate.nullable().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        phase: z.string().trim().max(100).optional(),
      })
    )
    .max(60)
    .default([]),
  remove: z.array(z.string().min(1)).max(60).default([]),
})
export type ReplanDiff = z.infer<typeof replanDiffSchema>

type TaskSnapshot = Pick<TaskRecord, "id" | "label" | "dueDate" | "priority" | "phase" | "dependsOn" | "completed" | "updatedAt">

export type ReplanProposalRecord = {
  id: string
  userId: string
  missionId: string
  turnId?: string
  status: "proposed" | "accepted" | "rejected"
  diff: ReplanDiff
  /** The affected tasks as they were when proposed — for the review diff and the edited-since check. */
  before: TaskSnapshot[]
  createdAt: string
  decidedAt?: string
}

/** Every reason the diff can't apply to the mission as it is now; empty when valid. */
export function replanIssues(diff: ReplanDiff, tasks: TaskRecord[], today: string): string[] {
  const issues: string[] = []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const removed = new Set(diff.remove)
  const addKeys = new Set<string>()

  if (!diff.add.length && !diff.change.length && !diff.remove.length && diff.targetDate === undefined)
    issues.push("the re-plan changes nothing")
  for (const id of diff.remove) if (!byId.has(id)) issues.push(`remove: no task with id "${id}"`)
  for (const c of diff.change) {
    if (!byId.has(c.taskId)) issues.push(`change: no task with id "${c.taskId}"`)
    if (removed.has(c.taskId)) issues.push(`task "${c.taskId}" is both changed and removed`)
    if (c.label === undefined && c.dueDate === undefined && c.priority === undefined && c.phase === undefined)
      issues.push(`change for "${c.taskId}" changes nothing`)
  }
  if (new Set(diff.change.map((c) => c.taskId)).size !== diff.change.length) issues.push("a task is changed twice")
  for (const a of diff.add) {
    if (addKeys.has(a.key) || byId.has(a.key)) issues.push(`duplicate key "${a.key}"`)
    addKeys.add(a.key)
  }
  for (const a of diff.add)
    for (const dep of a.dependsOn)
      if (!addKeys.has(dep) && (!byId.has(dep) || removed.has(dep))) issues.push(`added task "${a.key}" depends on unknown or removed "${dep}"`)

  const dates = [
    ...diff.add.map((a) => [a.key, a.dueDate] as const),
    ...diff.change.map((c) => [c.taskId, c.dueDate] as const),
  ]
  for (const [key, due] of dates) if (due && due.slice(0, 10) < today) issues.push(`"${key}" would be due ${due.slice(0, 10)}, in the past`)
  if (diff.targetDate && diff.targetDate.slice(0, 10) < today) issues.push(`targetDate ${diff.targetDate} is in the past`)

  // The dependency graph after the diff must have no loops.
  const after = [
    ...tasks.filter((t) => !removed.has(t.id)).map((t) => ({ key: t.id, dependsOn: (t.dependsOn ?? []).filter((d) => !removed.has(d)) })),
    ...diff.add.map((a) => ({ key: a.key, dependsOn: a.dependsOn })),
  ]
  const cycle = findCycle(after)
  if (cycle) issues.push(`dependency loop: ${cycle.join(" → ")}`)
  return issues
}

const snapshot = (t: TaskRecord): TaskSnapshot => ({
  id: t.id,
  label: t.label,
  dueDate: t.dueDate ?? null,
  priority: t.priority,
  phase: t.phase,
  dependsOn: t.dependsOn ?? [],
  completed: t.completed,
  updatedAt: t.updatedAt,
})

export async function createReplanProposal(
  userId: string,
  missionId: string,
  diff: ReplanDiff,
  tasks: TaskRecord[],
  turnId?: string
): Promise<ReplanProposalRecord> {
  const affected = new Set([...diff.change.map((c) => c.taskId), ...diff.remove])
  const record: ReplanProposalRecord = {
    id: randomUUID(),
    userId,
    missionId,
    ...(turnId ? { turnId } : {}),
    status: "proposed",
    diff,
    before: tasks.filter((t) => affected.has(t.id)).map(snapshot),
    createdAt: new Date().toISOString(),
  }
  await (await getDb()).collection<ReplanProposalRecord>(COLLECTIONS.replanProposals).insertOne({ ...record })
  return record
}

export async function getReplanProposal(userId: string, missionId: string, id: string) {
  return (await getDb())
    .collection<ReplanProposalRecord>(COLLECTIONS.replanProposals)
    .findOne({ userId, missionId, id }, { projection: { _id: 0 } })
}

export type ReplanOutcome =
  | { kind: "accepted"; added: number; changed: number; removed: number }
  | { kind: "rejected" }
  | { kind: "not_found" }
  | { kind: "already_decided"; status: ReplanProposalRecord["status"] }
  | { kind: "stale"; message: string }

export async function rejectReplan(userId: string, missionId: string, id: string): Promise<ReplanOutcome> {
  const col = (await getDb()).collection<ReplanProposalRecord>(COLLECTIONS.replanProposals)
  const claimed = await col.findOneAndUpdate(
    { userId, missionId, id, status: "proposed" },
    { $set: { status: "rejected", decidedAt: new Date().toISOString() } }
  )
  if (claimed) return { kind: "rejected" }
  const existing = await col.findOne({ userId, missionId, id })
  return existing ? { kind: "already_decided", status: existing.status } : { kind: "not_found" }
}

class StaleReplan extends Error {}

/**
 * Applies the whole diff in one transaction. Each changed/removed task must
 * still be exactly as it was when proposed (same updatedAt); otherwise the
 * user's later edits would be overwritten, so nothing is applied.
 * `beforeCommit` is a failure-injection seam for tests.
 */
export async function acceptReplan(
  userId: string,
  missionId: string,
  id: string,
  options: { beforeCommit?: () => Promise<void> } = {}
): Promise<ReplanOutcome> {
  const db = await getDb()
  try {
    const outcome = await withTransaction(async (session): Promise<ReplanOutcome | null> => {
      const now = new Date().toISOString()
      const proposal = await db
        .collection<ReplanProposalRecord>(COLLECTIONS.replanProposals)
        .findOneAndUpdate(
          { userId, missionId, id, status: "proposed" },
          { $set: { status: "accepted", decidedAt: now } },
          { session, returnDocument: "after" }
        )
      if (!proposal) return null
      const { diff } = proposal
      const tasks = db.collection<TaskRecord>(COLLECTIONS.tasks)
      const beforeById = new Map(proposal.before.map((t) => [t.id, t]))
      const stale = (taskId: string) => {
        throw new StaleReplan(
          `"${beforeById.get(taskId)?.label ?? taskId}" has changed since Velora proposed this re-plan, so it wasn't applied. Ask Velora to re-plan again.`
        )
      }

      for (const taskId of diff.remove) {
        const res = await tasks.deleteOne({ userId, missionId, id: taskId, updatedAt: beforeById.get(taskId)?.updatedAt }, { session })
        if (res.deletedCount !== 1) stale(taskId)
        await tasks.updateMany({ userId, missionId, dependsOn: taskId }, { $pull: { dependsOn: taskId } }, { session })
      }
      for (const change of diff.change) {
        const { taskId, ...fields } = change
        const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
        const res = await tasks.updateOne(
          { userId, missionId, id: taskId, updatedAt: beforeById.get(taskId)?.updatedAt },
          { $set: { ...set, updatedAt: now } },
          { session }
        )
        if (res.matchedCount !== 1) stale(taskId)
      }
      const idByKey = new Map(diff.add.map((a) => [a.key, randomUUID()]))
      if (diff.add.length) {
        await tasks.insertMany(
          diff.add.map((a, i) => ({
            id: idByKey.get(a.key)!,
            userId,
            missionId,
            category: a.phase ?? "General",
            ...(a.phase ? { phase: a.phase } : {}),
            label: a.label,
            completed: false,
            dueDate: a.dueDate ?? null,
            priority: a.priority ?? "medium",
            risk: "low" as const,
            source: "agent" as const,
            dependsOn: a.dependsOn.map((d) => idByKey.get(d) ?? d),
            createdAt: new Date(Date.parse(now) + i).toISOString(),
            updatedAt: now,
          })),
          { session }
        )
      }
      if (diff.targetDate !== undefined) {
        await db
          .collection<MissionRecord>(COLLECTIONS.missions)
          .updateOne({ userId, id: missionId }, { $set: { targetDate: diff.targetDate, updatedAt: now } }, { session })
      }

      await emitEvent(
        userId,
        {
          missionId,
          type: "replan-accepted",
          actor: "user",
          payload: {
            replanId: id,
            reason: diff.reason,
            added: diff.add.map((a) => a.label),
            changed: diff.change.map((c) => beforeById.get(c.taskId)?.label ?? c.taskId),
            removed: diff.remove.map((r) => beforeById.get(r)?.label ?? r),
            ...(proposal.turnId ? { turnId: proposal.turnId } : {}),
          },
        },
        { session }
      )
      await options.beforeCommit?.()
      return { kind: "accepted", added: diff.add.length, changed: diff.change.length, removed: diff.remove.length }
    })
    if (outcome) return outcome
  } catch (error) {
    if (error instanceof StaleReplan) return { kind: "stale", message: error.message }
    throw error
  }
  const existing = await getReplanProposal(userId, missionId, id)
  return existing ? { kind: "already_decided", status: existing.status } : { kind: "not_found" }
}
