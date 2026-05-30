import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { getUserByEmail } from "@/lib/mongodb/users"

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = body.email?.toLowerCase?.()
    const password = body.password
    if (!email || !password) return NextResponse.json({ success: false, error: "email and password required" }, { status: 400 })

    const user = await getUserByEmail(email)
    if (!user) return NextResponse.json({ success: false, error: "invalid credentials" }, { status: 401 })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return NextResponse.json({ success: false, error: "invalid credentials" }, { status: 401 })

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
    return NextResponse.json({ success: true, data: { token } })
  } catch (err) {
    console.error("POST /api/auth/login", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
