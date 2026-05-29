# Velora Development Plan

Velora is being built as a believable intelligent coordination system for life transitions. The goal is not to simulate a giant enterprise platform, but to ship a clean, modular product that feels agentic, useful, and demo-ready.

## Current Status

### Done

- [x] Core dashboard UI and flat layout direction
- [x] Mission timeline UI and responsive shell
- [x] Client-side navigation for header and sidebar
- [x] Internal chat scrolling and viewport-safe layout
- [x] Dashboard chat send flow
- [x] Mission chat send flow
- [x] Gemini API integration for dashboard chat
- [x] Gemini API integration for mission timeline chat
- [x] Shared Gemini helper layer for reuse
- [x] Dedicated transition plan API route
- [x] Onboarding flow that generates a plan and hands it off to missions
- [x] Basic persistence handoff via session storage
- [x] Error handling for transient Gemini failures

### In Progress

- [ ] Global style refinement for the final dashboard look
- [ ] Remove any remaining unused card styling
- [ ] Make the onboarding result more mission-like and structured
- [ ] Replace more prototype text with product-grade copy

### Next Up

- [ ] MongoDB Atlas integration for mission memory
- [ ] Mission/task persistence APIs
- [ ] Store generated plans, missions, and messages in the database
- [ ] Document upload pipeline for extracted context
- [ ] Lightweight replanning logic for overdue or blocked work
- [ ] Adaptive reminder system
- [ ] Agent Builder / Google Cloud demonstration layer

## File Structure Goal

The codebase should stay organized by responsibility:

- `src/app` for routes and API endpoints
- `src/components` for reusable UI
- `src/lib/ai` for Gemini and model access
- `src/lib/coordination` for planning, session handoff, and agent logic
- `src/lib` for shared utilities and project data

This keeps the product modular so the UI, orchestration, and persistence layers can evolve independently.

## Product Roadmap

### Phase 1: Gemini First Slice

Goal: make Velora actually think.

- [x] Store Gemini API key in local env
- [x] Create shared Gemini client wrapper
- [x] Add `/api/chat` for dashboard chat
- [x] Add `/api/plan` for transition-plan generation
- [x] Connect onboarding to plan generation
- [x] Connect mission timeline chat to Gemini

### Phase 2: Coordination Memory

Goal: give the product memory instead of stateless chat.

- [ ] Add MongoDB Atlas connection helper
- [ ] Create collections for missions, tasks, messages, and document context
- [ ] Persist onboarding plans as mission seeds
- [ ] Store mission chat history per mission

### Phase 3: Document Intelligence

Goal: turn uploads into usable coordination data.

- [ ] Add secure upload handling
- [ ] Extract document text for Gemini prompts
- [ ] Save extracted deadlines, names, and action items
- [ ] Surface extracted data in the mission feed

### Phase 4: Agentic Replanning

Goal: make the app feel proactive.

- [ ] Evaluate task risk on load or refresh
- [ ] Flag overdue or blocked tasks
- [ ] Reprioritize tasks when deadlines move
- [ ] Generate follow-up suggestions automatically

### Phase 5: Alerts and Follow-Ups

Goal: make the coordination system proactive outside the chat window.

- [ ] Add in-app notification updates
- [ ] Add reminder triggers
- [ ] Add delivery channels later if needed

### Phase 6: Google Cloud / Agent Builder

Goal: show the hackathon-relevant Google layer after the core slice works.

- [ ] Map current orchestration into Agent Builder terminology
- [ ] Decide which workflow is worth demonstrating there
- [ ] Keep the implementation simple and presentation-friendly

### Phase 7: Polish and Demo

Goal: make the product easy to understand in a live demo.

- [ ] Tighten copy across onboarding and mission views
- [ ] Polish loading and empty states
- [ ] Make the demo flow obvious from onboarding to mission view
- [ ] Final cross-device check

## What Is Real Today

- Dashboard chat sends to Gemini.
- Mission chat sends to Gemini.
- Onboarding generates a transition plan.
- The code is split into reusable helper modules.
- The current experience is intentionally lightweight so it can be expanded safely.

## What Is Still Simulated

- Long-term memory in a database
- Automatic replanning loop
- Background reminders
- Document extraction pipeline
- Agent Builder orchestration

## Next Milestone

Build the MongoDB-backed coordination memory layer, then use that stable data model to add document intelligence and replanning.

Once the core workflow is stable, I can guide you through the Google Cloud Agent Builder step-by-step in a way that matches this architecture instead of fighting it.
