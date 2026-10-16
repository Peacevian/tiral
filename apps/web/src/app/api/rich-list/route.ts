import { NextRequest, NextResponse } from "next/server"
import { getRichList, getRichRank } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// The Kampala Rich List (net worth = coins for now), plus where you stand.
export async function GET(request: NextRequest) {
  try {
    const token = readSessionCookie(request.headers.get("cookie"))
    const claims = token ? await verifySession(token) : null
    const [entries, me] = await Promise.all([getRichList(100), claims ? getRichRank(claims.userId) : Promise.resolve(null)])
    // Your own rank changes with every job, so this one isn't shared-cached.
    return NextResponse.json({ entries, me }, { headers: { "Cache-Control": "private, max-age=15" } })
  } catch (error) {
    console.error("Rich list failed:", error)
    return NextResponse.json({ error: "Could not load the rich list" }, { status: 500 })
  }
}
