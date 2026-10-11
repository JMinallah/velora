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
  AUTH_RESEND_KEY: z.string().optional(), // enables email magic-link sign-in
  EMAIL_FROM: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(), // absent → agent features run in manual mode
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GCS_BUCKET: z.string().optional(), // legacy document storage; replaced by R2 in Phase 5
  CRON_SECRET: z.string().optional(), // required in production for reminder dispatch
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

/** True when the LLM-backed agent features can run. */
export function agentEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY)
}
