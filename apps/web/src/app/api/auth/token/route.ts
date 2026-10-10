import { NextRequest, NextResponse } from "next/server"
import { readSessionCookie, verifySession } from "@/lib/session"

// Returns the raw session JWT so the game client can authenticate
// Colyseus matchmaking (client.auth.token). The cookie itself is HttpOnly.
export async function GET(request: NextRequest) {
  const cookie = readSessionCookie(request.headers.get("cookie"))
  if (!cookie) {
    return NextResponse.json({ token: null })
  }
  const claims = await verifySession(cookie)
  if (!claims) {
    return NextResponse.json({ token: null })
  }
  return NextResponse.json({ token: cookie })
}
