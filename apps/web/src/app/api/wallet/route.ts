import { NextRequest, NextResponse } from "next/server"
import { ensureWelcomeGrant, getCoinBalance, listCoinLedger } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Balance + recent history for the signed-in player.
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  try {
    await ensureWelcomeGrant(claims.userId)
    const [balance, entries] = await Promise.all([
      getCoinBalance(claims.userId),
      listCoinLedger(claims.userId, 30)
    ])
    return NextResponse.json({
      balance,
      entries: entries.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        reason: entry.reason,
        meta: entry.meta,
        createdAt: entry.createdAt.toISOString()
      }))
    })
  } catch (error) {
    console.error("Wallet unavailable:", error)
    return NextResponse.json({ error: "Wallet unavailable" }, { status: 503 })
  }
}
