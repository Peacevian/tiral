import { NextRequest, NextResponse } from "next/server"
import { sellHouseItem } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Sell a piece back for half what you paid: { id }.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/.test(body.id)) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    const result = await sellHouseItem({ userId: claims.userId, itemId: body.id })
    if (!result.ok) return NextResponse.json({ error: "That isn't yours." }, { status: 404 })
    return NextResponse.json({ paid: result.paid, balance: result.balance })
  } catch (error) {
    console.error("Furniture sale failed:", error)
    return NextResponse.json({ error: "Couldn't sell it. Try again." }, { status: 500 })
  }
}
