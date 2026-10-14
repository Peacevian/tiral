import { NextRequest, NextResponse } from "next/server"
import { HOUSING_TIERS, type HousingTierId } from "@tiral/game-core"
import { moveHouse } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Move to another housing tier; the new rent is charged from the next due date.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { tier?: unknown } | null
  const tier = HOUSING_TIERS.find((t) => t.id === body?.tier)
  if (!tier) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    await moveHouse(claims.userId, tier.id as HousingTierId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Move failed:", error)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }
}
