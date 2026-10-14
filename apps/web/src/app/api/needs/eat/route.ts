import { NextRequest, NextResponse } from "next/server"
import { eatFood } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Buy and eat one item: coins and energy move together, once per purchaseId.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { foodId?: unknown; purchaseId?: unknown } | null
  const foodId = typeof body?.foodId === "string" ? body.foodId : ""
  const purchaseId = typeof body?.purchaseId === "string" ? body.purchaseId : ""
  if (!/^[a-z]{2,20}$/.test(foodId) || !/^[0-9a-f-]{16,64}$/i.test(purchaseId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  try {
    const result = await eatFood({ userId: claims.userId, foodId, purchaseId })
    if (!result.ok) {
      const message =
        result.reason === "insufficient" ? "Not enough BNG" : result.reason === "unknown_food" ? "Unknown food" : "Already bought"
      return NextResponse.json({ error: message, balance: result.balance }, { status: result.reason === "duplicate" ? 409 : 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Eat failed:", error)
    return NextResponse.json({ error: "Shop unavailable" }, { status: 503 })
  }
}
