import { randomUUID } from "node:crypto"
import { getDb, withTransaction } from "@/adapters/db"
import { COLLECTIONS, type MissionRecord, type TaskRecord } from "./collections"
import { emitEvent } from "./events"
import { syncTaskRemindersSafely } from "./task-reminders"
import type { MissionPlan } from "./plan"

/**
 * Generated plans are proposals (FR-MSN-2, delivery plan 4-4): nothing exists
 * as a mission until the user accepts. Accepting creates the mission, all of
 * its tasks and the audit events in one transaction — all or nothing.
 * Rejecting changes nothing but the proposal's own status.
 */
export type PlanProposalRecord = {
  id: string
  userId: string
  status: "proposed" | "accepted" | "rejected"
  plan: MissionPlan
  request: { goal: string; deadline?: string; concerns?: string }
  promptVersion: string
  model: string
  attempts: number
  createdAt: string
  decidedAt?: string
  missionId?: string
}

const proposals = async () => (await getDb()).collection<PlanProposalRecord>(COLLECTIONS.planProposals)

export async function createProposal(
  userId: string,
  input: Pick<PlanProposalRecord, "plan" | "request" | "promptVersion" | "model" | "attempts">
): Promise<PlanProposalRecord> {
  const record: PlanProposalRecord = {
    id: randomUUID(),
    userId,
    status: "proposed",
    createdAt: new Date().toISOString(),
    ...input,
  }
  await (await proposals()).insertOne({ ...record })
  return record
}

export async function getProposal(userId: string, id: string): Promise<PlanProposalRecord | null> {
  return (await proposals()).findOne({ userId, id }, { projection: { _id: 0 } })
}

export async function listOpenProposals(userId: string): Promise<PlanProposalRecord[]> {
  return (await proposals())
    .find({ userId, status: "proposed" }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray()
}

export type DecideOutcome =
  | { kind: "accepted"; missionId: string }
  | { kind: "rejected" }
  | { kind: "not_found" }
  | { kind: "already_decided"; status: PlanProposalRecord["status"]; missionId?: string }

export async function rejectProposal(userId: string, id: string): Promise<DecideOutcome> {
  const col = await proposals()
  const claimed = await col.findOneAndUpdate(
    { userId, id, status: "proposed" },
    { $set: { status: "rejected", decidedAt: new Date().toISOString() } }
  )
  if (claimed) return { kind: "rejected" }
  const existing = await col.findOne({ userId, id })
  return existing ? { kind: "already_decided", status: existing.status, missionId: existing.missionId } : { kind: "not_found" }
}

/**
 * Accepts a proposal with the plan as the user edited it (already validated
 * by the caller). `beforeCommit` exists for failure-injection tests: anything
 * it throws aborts the transaction, leaving no trace of the mission.
 */
export async function acceptProposal(
  userId: string,
  id: string,
  plan: MissionPlan,
  options: { beforeCommit?: () => Promise<void> } = {}
): Promise<DecideOutcome> {
  const db = await getDb()
  const outcome = await withTransaction(async (session): Promise<DecideOutcome | null> => {
    const now = new Date().toISOString()
    const missionId = randomUUID()
    const claimed = await db
      .collection<PlanProposalRecord>(COLLECTIONS.planProposals)
      .findOneAndUpdate(
        { userId, id, status: "proposed" },
        { $set: { status: "accepted", decidedAt: now, missionId } },
        { session }
      )
    if (!claimed) return null

    const allTasks = plan.phases.flatMap((phase) => phase.tasks.map((task) => ({ phase: phase.name, ...task })))
    const idByKey = new Map(allTasks.map((t) => [t.key, randomUUID()]))
    const firstOpen = allTasks.find((t) => t.dependsOn.length === 0) ?? allTasks[0]

    const mission: MissionRecord = {
      id: missionId,
      userId,
      title: plan.title,
      overview: plan.summary,
      status: "On track",
      phase: plan.phases[0]?.name,
      nextStep: firstOpen?.label ?? "",
      targetDate: plan.targetDate ?? null,
      createdAt: now,
      updatedAt: now,
      source: "onboarding",
    }
    await db.collection<MissionRecord>(COLLECTIONS.missions).insertOne({ ...mission }, { session })

    const taskDocs: TaskRecord[] = allTasks.map((t, i) => ({
      id: idByKey.get(t.key)!,
      userId,
      missionId,
      category: t.phase,
      phase: t.phase,
      label: t.label,
      completed: false,
      dueDate: t.dueDate ?? null,
      priority: t.priority ?? "medium",
      risk: "low",
      source: "agent", // drafted by Velora, accepted by the user
      dependsOn: t.dependsOn.map((key) => idByKey.get(key)!).filter(Boolean),
      // Preserve plan order for same-millisecond listing.
      createdAt: new Date(Date.parse(now) + i).toISOString(),
      updatedAt: now,
    }))
    if (taskDocs.length) await db.collection<TaskRecord>(COLLECTIONS.tasks).insertMany(taskDocs.map((t) => ({ ...t })), { session })

    await emitEvent(
      userId,
      { missionId, type: "mission-created", actor: "user", payload: { title: mission.title, source: "onboarding" } },
      { session }
    )
    await emitEvent(
      userId,
      {
        missionId,
        type: "mission-accepted",
        actor: "user",
        payload: { proposalId: id, phases: plan.phases.length, tasks: taskDocs.length, promptVersion: claimed.promptVersion },
      },
      { session }
    )
    await options.beforeCommit?.()
    return { kind: "accepted", missionId }
  })
  if (outcome) {
    if (outcome.kind === "accepted") await syncTaskRemindersSafely(userId, outcome.missionId)
    return outcome
  }

  const existing = await getProposal(userId, id)
  return existing ? { kind: "already_decided", status: existing.status, missionId: existing.missionId } : { kind: "not_found" }
}
