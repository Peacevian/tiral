import { NextRequest, NextResponse } from "next/server"
import { getHouseItems } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// The furniture you own (placed in your room or in storage).
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  try {
    return NextResponse.json({ items: await getHouseItems(claims.userId) })
  } catch (error) {
    console.error("House items failed:", error)
    return NextResponse.json({ error: "Couldn't load your things." }, { status: 503 })
  }
}
