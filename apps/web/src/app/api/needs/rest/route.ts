import { NextRequest, NextResponse } from "next/server"
import { setResting } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Lie down in your bed at home (fast healing) or get up.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { resting?: unknown } | null
  if (typeof body?.resting !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    return NextResponse.json(await setResting(claims.userId, body.resting))
  } catch (error) {
    console.error("Rest failed:", error)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }
}
