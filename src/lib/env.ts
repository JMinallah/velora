import { z } from "zod"

/**
 * Server environment configuration (04-SECURITY §3).
 *
 * Required vars crash the server at first use with a named error — there are
 * no fallback defaults for secrets. Optional vars gate features: when absent,
 * the feature is disabled, never silently misconfigured.
 */
const serverEnvSchema = z.object({
  // Core (required)
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("velora"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars (generate with `npx auth secret`)"),

  // Auth providers (required for sign-in)
  AUTH_GOOGLE_ID: z.string().min(1, "AUTH_GOOGLE_ID is required"),
  AUTH_GOOGLE_SECRET: z.string().min(1, "AUTH_GOOGLE_SECRET is required"),

  // Optional feature gates
  AUTH_RESEND_KEY: z.string().optional(), // enables email magic-link sign-in and reminder emails
  EMAIL_FROM: z.string().optional(),
  // Public base URL, for links in emails. Absent → emails carry no links.
  APP_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(), // absent → agent features run in manual mode
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  // Google's terms forbid sending personal information to the *free* Gemini
  // tier (it may be used for training and read by reviewers) and require the
  // paid tier for EEA/UK/Swiss users. Production runs AI only when this says
  // "paid" (docs/08-LEGAL-RISKS.md A1/A2); development may use the free tier
  // with test data.
  GEMINI_TIER: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["free", "paid"]).default("free")),
  // Optional: send Gemini requests through another endpoint (an API gateway,
  // or the end-to-end tests' fake server). Absent → Google's own API.
  GEMINI_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  // App-wide model calls per day (Pacific), kept below the provider's free
  // quota (Flash-Lite: 500/day) so AI pauses cleanly instead of failing mid-chat.
  LLM_DAILY_CAP: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).default(450)),
  // Document storage (docs/06-DELIVERY-PLAN.md Phase 5, D4: Cloudflare R2).
  // "r2" needs the four R2_* vars; "local" (files under .data/uploads) is the
  // default outside production. Production without R2 refuses uploads.
  DOCUMENT_STORE: z.enum(["local", "r2"]).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  CRON_SECRET: z.string().optional(), // required in production for reminder dispatch
  // Comma-separated emails allowed to see the ops page (/ops). Empty → nobody.
  ADMIN_EMAILS: z.string().optional(),
  // Chat messages, audit events and the dispatch log are pruned after this many days.
  EVENT_RETENTION_DAYS: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(30).default(365)),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source)
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`Invalid server environment:\n${missing}\nSee .env.example for documentation.`)
  }
  return parsed.data
}

let cached: ServerEnv | null = null

export function env(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env)
  return cached
}

/**
 * True when the LLM-backed agent features can run: a key is set, and in
 * production the key is on Gemini's paid tier (real users' personal data
 * must never go to the free tier).
 */
export function agentEnabled(): boolean {
  return aiDisabledReason(env()) === null
}

/** Why AI features are off, or null when they can run. */
export function aiDisabledReason(e: Pick<ServerEnv, "GEMINI_API_KEY" | "GEMINI_TIER">, nodeEnv = process.env.NODE_ENV): string | null {
  if (!e.GEMINI_API_KEY) return "no GEMINI_API_KEY"
  if (nodeEnv === "production" && e.GEMINI_TIER !== "paid") return "production requires GEMINI_TIER=paid (Gemini's free tier must not receive personal data)"
  return null
}

/** Whether this signed-in email may see the ops page. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const admins = (env().ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  return admins.includes(email.toLowerCase())
}
