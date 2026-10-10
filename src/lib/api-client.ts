/**
 * Browser-side helper for Velora API routes. Every route answers
 * `{ success, data }` or `{ success: false, error }`; this unwraps the data
 * or throws an Error carrying the server's message, so UI code can show
 * `err.message` directly.
 */
export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const hasBody = init?.body !== undefined
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new Error(typeof json?.error === "string" ? json.error : `Request failed (${res.status})`)
  }
  return json.data as T
}
