import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createUser, getUserByEmail } from "@/lib/mongodb/users"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = body.email?.toLowerCase?.()
    const password = body.password
    const name = body.name

    if (!email || !password) return NextResponse.json({ success: false, error: "email and password required" }, { status: 400 })

    const existing = await getUserByEmail(email)
    if (existing) return NextResponse.json({ success: false, error: "email already registered" }, { status: 400 })

    const hash = await bcrypt.hash(password, 10)
    const user = await createUser({ email, name, passwordHash: hash })

    return NextResponse.json({ success: true, data: { id: user.id, email: user.email, name: user.name } }, { status: 201 })
  } catch (err) {
    console.error("POST /api/auth/register", err)
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
  }
}
