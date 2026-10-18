import { NextRequest, NextResponse } from "next/server"
import { HOME_CAREER, HOUSING_TIERS, findTierById, type HousingTierId } from "@tiral/game-core"
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
    const moved = await moveHouse(claims.userId, tier.id as HousingTierId)
    if (!moved.ok) {
      const needed = HOME_CAREER[tier.id as HousingTierId]
      const error =
        moved.reason === "career"
          ? `Only for ${needed ? findTierById(needed).name : "bigger"} owners`
          : moved.reason === "insufficient"
            ? `Moving your things costs ${moved.fee.toLocaleString("en-US")} BNG: not enough BNG.`
            : "You already live there."
      return NextResponse.json({ error }, { status: moved.reason === "career" ? 403 : 409 })
    }
    return NextResponse.json({ ok: true, fee: moved.fee })
  } catch (error) {
    console.error("Move failed:", error)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }
}
