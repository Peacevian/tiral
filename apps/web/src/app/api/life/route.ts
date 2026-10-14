import { NextRequest, NextResponse } from "next/server"
import { ensureWelcomeGrant, syncLife } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Catch the player's life up (rent, requests, shocks, stress) and return it.
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    await ensureWelcomeGrant(claims.userId)
    const life = await syncLife(claims.userId)
    if (!life) return NextResponse.json({ error: "Unknown player" }, { status: 404 })
    return NextResponse.json(life)
  } catch (error) {
    console.error("Life unavailable:", error)
    return NextResponse.json({ error: "Life unavailable" }, { status: 503 })
  }
}
