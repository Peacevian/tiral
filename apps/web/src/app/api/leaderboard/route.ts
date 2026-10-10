import { NextRequest, NextResponse } from "next/server"
import { getLeaderboard } from "@tiral/db"

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get("period") ?? "all"
    const since =
      period === "week" ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null
    const entries = await getLeaderboard(since)
    return NextResponse.json({ entries })
  } catch (error) {
    console.error("Leaderboard failed:", error)
    return NextResponse.json({ error: "Could not load leaderboard" }, { status: 500 })
  }
}
