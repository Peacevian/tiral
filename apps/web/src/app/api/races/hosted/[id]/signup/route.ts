import { NextRequest, NextResponse } from "next/server"
import { setHostedRaceSignup } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// "I'm in" for an upcoming prize race (a reminder lands in the inbox before the start).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = (await request.json().catch(() => null)) as { on?: unknown } | null
  try {
    const ok = await setHostedRaceSignup({ userId: claims.userId, id, on: body?.on !== false })
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That race has started or ended" }, { status: 409 })
  } catch (error) {
    console.error("Prize race signup failed:", error)
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 503 })
  }
}
