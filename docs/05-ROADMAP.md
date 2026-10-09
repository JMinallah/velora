# Velora v2 — Build Roadmap

**Version:** 2.0-draft · **Date:** 2026-07-17

Phases are strictly ordered; each has a **Definition of Done (DoD)** that includes its tests — a phase without its tests is not done. Trust infrastructure (events, receipts, tiers) is built *with* the features, not retrofitted.

---

## Phase 0 — Foundation (skeleton that already enforces the rules)
Scaffold Next.js (App Router, TS strict, Tailwind, shadcn/ui) · repo layout per 02-ARCHITECTURE §3.2 · adapters: Mongo (Atlas M0), env validation with fail-fast startup · Auth.js (Google + magic link) with `withAuth` deny-by-default wrapper · CI: lint, typecheck, unit tests, gitleaks · Vercel deploy with preview envs · `.env.example`.

**DoD:** deployed skeleton where signing in works, an example authenticated route passes the route×actor test matrix, CI is green and merge-blocking, and a missing env var crashes startup with a named error.

## Phase 1 — Domain core + manual CRUD (the app works with zero AI)
Domain layer: missions, tasks, events (append-only, emitted by every mutation) · REST routes over it · dashboard, mission detail, task management UI · activity feed rendering events · rate limiting (Upstash).

**DoD:** a user can run a whole mission manually; every mutation appears in the activity feed; integration tests cover all routes; the app is genuinely useful before any LLM call exists (NFR-REL-1's degradation target is the *baseline*, not a fallback).

## Phase 2 — Agent loop + chat (the heart)
`LlmProvider` adapter (Gemini pinned model; temperature/config in code) · reasoning loop with bounds (03-AGENT-DESIGN §1.2) · tool registry with read + write tiers, receipts, events · streaming chat UI with inline receipts · grounding via read tools · eval harness with `tool-selection/` and `regression/` sets in CI.

**DoD:** chat can answer grounded questions and create/update tasks with visible receipts; invalid tool args self-correct; loop bounds proven by test; evals merge-blocking.

## Phase 3 — Trust mechanics (before any destructive capability ships)
Destructive tier + server-side confirmation flow (`pending_actions`, nonce) · undo for write-tier tools · autonomy dial · origin labels (`user|agent`) across UI · injection eval set active.

**DoD:** no destructive tool can execute without a confirmed nonce (tested); undo round-trips cleanly; injection evals at zero unauthorized proposals.

## Phase 4 — Planning (missions born from conversation)
Onboarding conversation · structured plan generation with `missionPlanSchema` + repair retries · proposal review/accept/edit UI · re-plan diffs applied transactionally · risk indicator · `planning/` eval set.

**DoD:** the SRS fixture prompt (FR-MSN-1 AC) yields a valid ≥8-task/≥3-phase proposal; rejection leaves state untouched (byte-diff test); accepted plans emit `mission.accepted`.

## Phase 5 — Documents
R2 presigned uploads · quarantined Gemini multimodal extraction · unverified→confirmed flow · signed-URL viewing · adversarial document fixtures in the injection set.

**DoD:** FR-DOC-3's adversarial fixture ingests with zero tool calls (regression test); foreign-user document access returns 404; URLs expire ≤15 min.

## Phase 6 — Reminders + notifications
Reminder domain + idempotent dispatcher · Vercel Cron primary, GitHub Actions fallback with `CRON_SECRET` · Resend email + in-app notifications · preferences.

**DoD:** double-fired cron sends exactly one email (idempotency test); dispatch log visible; preferences honored.

## Phase 7 — Production hardening (launch gate)
Groq fallback + manual-mode banner · quota meters (per-user, global) · Sentry wired with scrubbing · nightly backup workflow + one rehearsed restore · retention pruning · `refusal/` evals · Lighthouse ≥80 · a real device pass on the three core flows · data export & account deletion.

**DoD:** every NFR in 01-SRS §3 has a checked verification; the 04-SECURITY §8 CI gate list is fully active; kill-the-LLM chaos test leaves manual mode fully working.

---

## Working agreements
- `main` is always deployable; features land by PR with green CI (including evals when agent/prompts change).
- Every production bug → regression test or eval fixture in the fix PR.
- Scope discipline: anything not in 01-SRS is a new requirement first, code second.
- v1 repos: `velora/` stays as read-only reference (its README, schemas, and MCP tool shapes are useful); `velora-source/` has no remaining value and can be archived or deleted at the owner's discretion.
