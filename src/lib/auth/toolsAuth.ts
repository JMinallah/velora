import jwt, { type JwtPayload } from "jsonwebtoken"
import { getUserById } from "@/lib/mongodb/users"

const TOOLS_API_KEY = process.env.TOOLS_API_KEY || ""
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"

type RequestLike = { headers: Headers }

export async function authorizeToolRequest(req: Request | RequestLike): Promise<{ ok: boolean; reason?: string; userId?: string }> {
  const apiKey = req.headers.get("x-tools-api-key") ?? req.headers.get("x-api-key")
  if (apiKey && TOOLS_API_KEY && apiKey === TOOLS_API_KEY) return { ok: true }

  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7)
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
      const subject = typeof payload.sub === "string" ? payload.sub : ""
      if (subject) {
        const user = await getUserById(subject)
        if (user) return { ok: true, userId: user.id }
      }
    } catch {
      return { ok: false, reason: "invalid token" }
    }
  }

  return { ok: false, reason: "missing api key or bearer token" }
}
