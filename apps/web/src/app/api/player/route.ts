import { NextRequest, NextResponse } from "next/server"
import {
  ensureWelcomeGrant,
  findUserById,
  getCoinBalance,
  hasTikTokLink,
  listCoinLedger,
  loadNeeds,
  syncLife,
  touchLastSeen
} from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// Everything the app shell shows about the signed-in player, in one request:
// who they are, coins, body, and life (catching up rent/requests on the way).
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ user: null })
  try {
    const userId = claims.userId
    // Independent reads run side by side; money is sequential because life
    // (rent, shocks) may move coins before the balance is read.
    const [user, tiktokLinked, needs, money] = await Promise.all([
      findUserById(userId),
      hasTikTokLink(userId),
      loadNeeds(userId),
      (async () => {
        await ensureWelcomeGrant(userId)
        const life = await syncLife(userId)
        const [balance, entries] = await Promise.all([getCoinBalance(userId), listCoinLedger(userId, 30)])
        return { life, balance, entries }
      })()
    ])
    if (!user) return NextResponse.json({ user: null })
    const { life, balance, entries } = money
    void touchLastSeen(user.id).catch(() => {})
    return NextResponse.json({
      user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, tiktokLinked, loadout: user.avatarLoadout },
      balance,
      entries: entries.map((entry) => ({
        id: entry.id,
        delta: entry.delta,
        reason: entry.reason,
        meta: entry.meta,
        createdAt: entry.createdAt.toISOString()
      })),
      needs,
      life
    })
  } catch (error) {
    console.error("Player unavailable:", error)
    return NextResponse.json({ error: "Player unavailable" }, { status: 503 })
  }
}
