# Velora

**Your Transition AI** — an adaptive coordination agent for major life transitions. Describe a big change (relocating, switching careers, starting university) and Velora plans it as a **mission**: tasks, timeline, documents, and reminders, coordinated by an AI agent that is transparent, confirmable, and auditable by design.

> **Status:** v2 production rebuild in progress. v1 was a hackathon build whose agent ran on a since-lost Vertex AI Reasoning Engine; v2 brings the agent in-process and runs entirely on free-tier infrastructure. See [docs/](docs/README.md) for the full documentation set and [docs/05-ROADMAP.md](docs/05-ROADMAP.md) for build phases.

## Documentation

| Doc | Contents |
|---|---|
| [docs/01-SRS.md](docs/01-SRS.md) | Requirements with acceptance criteria |
| [docs/02-ARCHITECTURE.md](docs/02-ARCHITECTURE.md) | System design, data model, deployment |
| [docs/03-AGENT-DESIGN.md](docs/03-AGENT-DESIGN.md) | Agent reasoning loop, tools, trust mechanics, evals |
| [docs/04-SECURITY.md](docs/04-SECURITY.md) | Threat model and controls |
| [docs/05-ROADMAP.md](docs/05-ROADMAP.md) | Phased delivery plan |

## Stack

Next.js (App Router, TypeScript) · MongoDB Atlas · Auth.js (Google OAuth + email magic links) · Gemini API · Tailwind CSS 4 + shadcn/ui · Vitest · GitHub Actions CI · deployed on Vercel.

## Getting started

```bash
cp .env.example .env.local   # fill in the required values (documented inline)
npm install
npm run dev
```

The app validates its environment on first use and fails fast with a named error for any missing required variable — see [.env.example](.env.example) for what each one does and where to get it.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run lint` / `typecheck` | Static checks |
| `npm test` / `test:watch` | Vitest suite |
| `npm run e2e` | Playwright browser tests against a production build with AI disabled (needs `TEST_MONGODB_URI`; locally `PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome) |
| `npm run reminders:run` | Manual reminder dispatch (dev) |

CI runs secret scanning (gitleaks), lint, typecheck, unit/integration tests, end-to-end browser tests, agent evals, and dependency audits on every push and PR.

## License

See [LICENSE](LICENSE).
