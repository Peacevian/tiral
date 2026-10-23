import { NextRequest, NextResponse } from "next/server"
import { getMyPlots, listClaimedPlots } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"

// Land on the map: who holds which plot (everyone), and your own plots with
// their ground rent (when signed in). The plots themselves come from
// @tiral/game-core.
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  try {
    const [held, mine] = await Promise.all([listClaimedPlots(), claims ? getMyPlots(claims.userId) : Promise.resolve([])])
    return NextResponse.json({
      claimed: held.map((plot) => ({ plotId: plot.plotId, ownerName: plot.ownerName, mine: plot.ownerId === claims?.userId, building: plot.building })),
      mine
    })
  } catch (error) {
    console.error("Land list failed:", error)
    return NextResponse.json({ error: "Couldn't load the land." }, { status: 503 })
  }
}
