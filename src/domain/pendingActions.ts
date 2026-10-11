import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { getDb } from "@/adapters/db"
import { COLLECTIONS } from "./collections"
import { emitEvent } from "./events"
import type { PendingActionStatus, ProposedActionView } from "@/types"

/**
 * Destructive actions the agent proposed, awaiting the user's decision
 * (docs/03-AGENT-DESIGN.md §5, delivery plan 3-1/3-3).
 *
 * The model can only create these. Executing one requires an authenticated
 * request carrying the single-use nonce that was shown to the user — the
 * model never sees it — and the server runs the arguments stored here, so
 * a client cannot alter what gets deleted.
 */
export const PENDING_ACTION_TTL_MS = 10 * 60 * 1000

export type PendingActionRecord = {
  id: string
  userId: string
  missionId: string
  turnId: string
  tool: string
  args: unknown
  summary: string
  nonce: string
  status: PendingActionStatus | "executing"
  createdAt: string
  expiresAt: Date
  decidedAt?: string
}

export async function proposeAction(
  userId: string,
  input: { missionId: string; turnId: string; tool: string; args: unknown; summary: string }
): Promise<ProposedActionView> {
  const now = Date.now()
  const record: PendingActionRecord = {
    id: randomUUID(),
    userId,
    missionId: input.missionId,
    turnId: input.turnId,
    tool: input.tool,
    args: input.args,
    summary: input.summary,
    nonce: randomBytes(24).toString("base64url"),
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PENDING_ACTION_TTL_MS),
  }
  const db = await getDb()
  await db.collection<PendingActionRecord>(COLLECTIONS.pendingActions).insertOne(record)
  await emitEvent(userId, {
    missionId: input.missionId,
    type: "action-proposed",
    actor: { actor: "agent", turnId: input.turnId, tool: input.tool, args: input.args },
    payload: { actionId: record.id, summary: input.summary },
  })
  return toView(record)
}

export function toView(record: PendingActionRecord): ProposedActionView {
  return {
    id: record.id,
    nonce: record.nonce,
    tool: record.tool,
    summary: record.summary,
    status: record.status === "executing" ? "pending" : record.status,
    expiresAt: record.expiresAt.toISOString(),
  }
}

function nonceMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type ClaimOutcome =
  | { kind: "claimed"; action: PendingActionRecord }
  | { kind: "rejected"; action: PendingActionRecord }
  | { kind: "not_found" }
  | { kind: "bad_nonce" }
  | { kind: "already_decided"; status: PendingActionRecord["status"] }
  | { kind: "expired" }

/**
 * Atomically moves a pending action out of "pending" — to "executing" on
 * confirm, "rejected" on reject — so it can be decided exactly once, even
 * under concurrent or replayed requests. Foreign or unknown ids are
 * indistinguishable ("not_found").
 */
export async function claimAction(
  userId: string,
  missionId: string,
  actionId: string,
  nonce: string,
  decision: "confirm" | "reject"
): Promise<ClaimOutcome> {
  const actions = (await getDb()).collection<PendingActionRecord>(COLLECTIONS.pendingActions)
  const existing = await actions.findOne({ userId, missionId, id: actionId })
  if (!existing) return { kind: "not_found" }
  if (!nonceMatches(nonce, existing.nonce)) return { kind: "bad_nonce" }
  if (existing.status !== "pending") return { kind: "already_decided", status: existing.status }

  const now = new Date()
  if (existing.expiresAt <= now) {
    await actions.updateOne({ userId, id: actionId, status: "pending" }, { $set: { status: "expired" } })
    return { kind: "expired" }
  }

  const claimed = await actions.findOneAndUpdate(
    { userId, missionId, id: actionId, status: "pending", expiresAt: { $gt: now } },
    { $set: { status: decision === "confirm" ? "executing" : "rejected", decidedAt: now.toISOString() } },
    { returnDocument: "after" }
  )
  if (!claimed) {
    // Lost a race with another decision for the same action.
    const latest = await actions.findOne({ userId, id: actionId })
    return { kind: "already_decided", status: latest?.status ?? "pending" }
  }

  if (decision === "reject") {
    await emitEvent(userId, {
      missionId,
      type: "action-rejected",
      actor: "user",
      payload: { actionId, tool: claimed.tool, summary: claimed.summary },
    })
    return { kind: "rejected", action: claimed }
  }
  return { kind: "claimed", action: claimed }
}

export async function finishAction(userId: string, actionId: string, status: "executed" | "failed") {
  const db = await getDb()
  await db.collection<PendingActionRecord>(COLLECTIONS.pendingActions).updateOne({ userId, id: actionId }, { $set: { status } })
}
