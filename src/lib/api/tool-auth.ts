export function isToolAuthorized(request: Request): boolean {
  const configuredKey = process.env.TOOLS_API_KEY

  // If no key is configured, keep local/dev experience simple.
  if (!configuredKey) return true

  const headerKey = request.headers.get("x-tools-api-key") ?? request.headers.get("x-api-key")
  if (headerKey && headerKey === configuredKey) return true

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length)
    if (bearer === configuredKey) return true
  }

  return false
}
