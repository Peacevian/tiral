import { NextRequest, NextResponse } from "next/server"
import { moveUpToSmallBusiness } from "@tiral/db"
import { openBale } from "@tiral/game-core"
import { readSessionCookie, verifySession } from "@/lib/session"

const WHY: Record<string, string> = {
  already: "You've already moved up.",
  experience: "Run 5 rolex shifts first.",
  tiktok: "Connect TikTok first: LivTok sellers need a real account.",
  capital: "You need 500,000 BNG saved."
}

// Move up to Small business: 150,000 of your savings becomes your first bale.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  try {
    const result = await moveUpToSmallBusiness(claims.userId, openBale("tops", Math.random))
    if (!result.ok) return NextResponse.json({ error: WHY[result.reason] ?? "You can't move up yet.", balance: result.balance }, { status: 409 })
    return NextResponse.json({ tier: result.tier, balance: result.balance })
  } catch (error) {
    console.error("Move up failed:", error)
    return NextResponse.json({ error: "Couldn't move up. Try again." }, { status: 500 })
  }
}
