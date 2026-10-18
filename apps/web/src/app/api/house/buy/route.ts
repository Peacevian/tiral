import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { buyHouseItem } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Buy a piece of furniture: { item, grade, color, ref? } (ref makes a retry safe).
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { item?: unknown; grade?: unknown; color?: unknown; ref?: unknown } | null
  if (!body || typeof body.item !== "string" || typeof body.grade !== "string" || typeof body.color !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const ref = typeof body.ref === "string" && /^[\w-]{8,64}$/.test(body.ref) ? body.ref : randomUUID()
  try {
    const result = await buyHouseItem({ userId: claims.userId, item: body.item, grade: body.grade, color: body.color, refId: ref })
    if (!result.ok) {
      return NextResponse.json({ error: result.reason === "insufficient" ? "Not enough BNG." : "That isn't sold here.", balance: result.balance }, { status: 409 })
    }
    return NextResponse.json({ owned: result.owned, balance: result.balance })
  } catch (error) {
    console.error("Furniture purchase failed:", error)
    return NextResponse.json({ error: "Couldn't buy it. Try again." }, { status: 500 })
  }
}
