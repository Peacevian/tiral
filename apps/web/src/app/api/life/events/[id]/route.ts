import { NextRequest, NextResponse } from "next/server"
import { resolveLifeEvent } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Answer a family request: send the money or say no.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null
  const action = body?.action
  if (!/^[0-9a-f-]{36}$/i.test(id) || (action !== "pay" && action !== "refuse")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  try {
    const result = await resolveLifeEvent({ userId: claims.userId, eventId: id, action })
    if (!result.ok) {
      const message = result.reason === "insufficient" ? "Not enough BNG" : "Already answered"
      return NextResponse.json({ error: message }, { status: result.reason === "insufficient" ? 400 : 409 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Life event failed:", error)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }
}
