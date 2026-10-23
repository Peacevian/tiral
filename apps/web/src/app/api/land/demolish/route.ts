import { NextRequest, NextResponse } from "next/server"
import { demolishBuilding } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Knock down what's on your plot: { plotId }. Nothing is paid back.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { plotId?: unknown } | null
  if (!body || typeof body.plotId !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    const result = await demolishBuilding({ userId: claims.userId, plotId: body.plotId })
    if (!result.ok) return NextResponse.json({ error: "Nothing to knock down there." }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Demolish failed:", error)
    return NextResponse.json({ error: "Couldn't do that. Try again." }, { status: 500 })
  }
}
