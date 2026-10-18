import { NextRequest, NextResponse } from "next/server"
import { moveUpToTownBusiness } from "@tiral/db"
import { STARTER_FLEET, TOWN_LIVES_NEEDED, hireRider } from "@tiral/game-core"
import { readSessionCookie, verifySession } from "@/lib/session"

const WHY: Record<string, string> = {
  already: "You've already moved up.",
  tier: "Move up to Small business first.",
  experience: `Do ${TOWN_LIVES_NEEDED} LivTok lives first.`,
  capital: "You need 5,000,000 BNG saved."
}

// Move up to Town business: 2,000,000 of your savings becomes your first boda fleet.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  try {
    const riders: Array<{ rider: string; skill: number }> = []
    for (let i = 0; i < STARTER_FLEET.count; i++) riders.push(hireRider(Math.random, riders.map((hired) => hired.rider)))
    const result = await moveUpToTownBusiness(claims.userId, riders)
    if (!result.ok) return NextResponse.json({ error: WHY[result.reason] ?? "You can't move up yet.", balance: result.balance }, { status: 409 })
    return NextResponse.json({ tier: "town", balance: result.balance })
  } catch (error) {
    console.error("Move up to Town business failed:", error)
    return NextResponse.json({ error: "Couldn't move up. Try again." }, { status: 500 })
  }
}
