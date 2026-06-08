import { NextRequest, NextResponse } from "next/server"
import jwt, { type JwtPayload } from "jsonwebtoken"
import { getUserById } from "@/lib/mongodb/users"

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    const subject = typeof payload.sub === "string" ? payload.sub : ""
    if (!subject) throw new Error("No subject in token")

    const user = await getUserById(subject)
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })

    // Don't return passwordHash
    const { passwordHash, ...safeUser } = user
    return NextResponse.json({ success: true, data: safeUser })
  } catch (err) {
    return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 })
  }
}
