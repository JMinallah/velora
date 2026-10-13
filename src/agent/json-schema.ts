import type { ZodTypeAny } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

/** Removes a JSON Schema keyword everywhere in a schema (not from property *names*). */
function withoutKeyword(node: unknown, keyword: string): unknown {
  if (Array.isArray(node)) return node.map((n) => withoutKeyword(n, keyword))
  if (!node || typeof node !== "object") return node
  return Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => k !== keyword)
      .map(([k, v]) =>
        k === "properties"
          ? [k, Object.fromEntries(Object.entries(v as object).map(([name, s]) => [name, withoutKeyword(s, keyword)]))]
          : [k, withoutKeyword(v, keyword)]
      )
  )
}

/**
 * JSON Schema for Gemini structured output. Gemini rejects `maxItems` (400,
 * measured 2026-10-11), so it is stripped; the zod schema still enforces the
 * limits when the answer is parsed.
 */
export function structuredOutputSchema(schema: ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>
  delete json.$schema
  return withoutKeyword(json, "maxItems") as Record<string, unknown>
}
