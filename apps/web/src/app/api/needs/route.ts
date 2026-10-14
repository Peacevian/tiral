import { NextRequest, NextResponse } from "next/server"
import { loadNeeds } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Signed-in player's current energy/health (regen included) and rest state.
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    return NextResponse.json(await loadNeeds(claims.userId))
  } catch (error) {
    console.error("Needs unavailable:", error)
    return NextResponse.json({ error: "Needs unavailable" }, { status: 503 })
  }
}
