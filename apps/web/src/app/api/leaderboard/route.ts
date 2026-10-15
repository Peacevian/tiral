import { NextRequest, NextResponse } from "next/server"
import { getLeaderboard } from "@tiral/db"

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const period = params.get("period") ?? "all"
    const since =
      period === "week" ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null
    // ?limit=3 for the landing page's "top hunters"; at most 100.
    const limit = Math.min(100, Math.max(1, Math.floor(Number(params.get("limit")) || 100)))
    const entries = await getLeaderboard(since, limit)
    // Rankings move slowly: phones reuse an answer for 30 s instead of re-asking.
    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }
    )
  } catch (error) {
    console.error("Leaderboard failed:", error)
    return NextResponse.json({ error: "Could not load leaderboard" }, { status: 500 })
  }
}
