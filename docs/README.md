# Velora v2 — Documentation

Velora is an AI-powered life-transition coordination agent: users describe a major life change (relocation, career switch, university), and Velora plans it as a **mission** — tasks, timeline, documents, reminders — coordinated by an AI agent that is transparent, confirmable, and auditable by design.

This is the production rebuild of the v1 hackathon project. Read in order:

| Doc | What it covers |
|---|---|
| [01-SRS.md](01-SRS.md) | Requirements: what the system must do, how well, and why v2 differs from v1 |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | System design: layering, data model, flows, free-tier deployment topology |
| [03-AGENT-DESIGN.md](03-AGENT-DESIGN.md) | The agent: reasoning loop, tool contract, robustness, trust mechanics, evals |
| [04-SECURITY.md](04-SECURITY.md) | Threat model, auth, prompt-injection defense, data protection, CI security gates |
| [05-ROADMAP.md](05-ROADMAP.md) | Build phases with definitions of done |

## The three ideas that define v2

1. **The agent lives in the repo.** v1's reasoning engine was a cloud resource whose source was lost when the GCP project died. In v2, prompts, tools, and the loop are versioned code.
2. **The model proposes, the system disposes.** The LLM only acts through typed, tiered tools; plans are proposals the user accepts; destructive actions require server-side confirmation; everything emits an audit event.
3. **$0 steady state.** Vercel Hobby + MongoDB Atlas M0 + Cloudflare R2 + Gemini free tier (Groq fallback) + Upstash + Resend + Sentry + GitHub Actions — with defined, honest behavior at every free-tier limit.

## Stack summary

Next.js (App Router, TypeScript strict) · MongoDB Atlas · Auth.js · Gemini API (function calling + multimodal, pinned models) · Cloudflare R2 · Upstash Redis · Resend · Vercel · GitHub Actions CI (lint, typecheck, tests, gitleaks, agent evals).
