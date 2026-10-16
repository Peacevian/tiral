import { NextRequest, NextResponse } from "next/server"
import {
  ensureWelcomeGrant,
  findUserById,
  getCoinBalance,
  hasTikTokLink,
  ladderCounts,
  listCoinLedger,
  loadNeeds,
  readLife,
  syncLife,
  touchLastSeen
} from "@tiral/db"
import { clearSessionCookie, readSessionCookie, verifySession } from "@/lib/session"
import { isRemoteAvatar, refreshTikTokAvatar } from "@/lib/avatars"

// The app polls this every minute and after every payout, from every open tab.
// Settling life (rent, requests, shocks) takes a lock and writes, so it runs at
// most every SYNC_EVERY_MS per player; in between we only read. The welcome
// grant is checked once per player per server process (the ledger refuses a
// second grant anyway), and last-seen is written at most every SEEN_EVERY_MS.
const SYNC_EVERY_MS = 2 * 60 * 1000
const SEEN_EVERY_MS = 5 * 60 * 1000
const lastSync = new Map<string, number>()
const lastSeen = new Map<string, number>()
const granted = new Set<string>()

// Everything the app shell shows about the signed-in player, in one request:
// who they are, coins, body, and life (catching up rent/requests on the way).
export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ user: null })
  try {
    const userId = claims.userId
    // A valid session for an account that no longer exists (a reset database,
    // a guest made on another server): sign out instead of failing forever.
    const user = await findUserById(userId)
    if (!user) {
      const response = NextResponse.json({ user: null })
      response.headers.set("Set-Cookie", clearSessionCookie())
      return response
    }
    // Independent reads run side by side; money is sequential because life
    // (rent, shocks) may move coins before the balance is read.
    const [tiktokLinked, needs, ladder, money] = await Promise.all([
      hasTikTokLink(userId),
      loadNeeds(userId),
      ladderCounts(userId),
      (async () => {
        if (!granted.has(userId)) {
          await ensureWelcomeGrant(userId)
          granted.add(userId)
        }
        const now = Date.now()
        const syncDue = now - (lastSync.get(userId) ?? 0) >= SYNC_EVERY_MS
        const life = syncDue ? await syncLife(userId) : await readLife(userId)
        if (syncDue) lastSync.set(userId, now)
        const [balance, entries] = await Promise.all([getCoinBalance(userId), listCoinLedger(userId, 30)])
        return { life, balance, entries }
      })()
    ])
    // Still pointing at TikTok's expiring photo link: swap in our own copy (next load shows it).
    if (isRemoteAvatar(user.avatarUrl)) void refreshTikTokAvatar(user.id)
    const { life, balance, entries } = money
    if (Date.now() - (lastSeen.get(user.id) ?? 0) >= SEEN_EVERY_MS) {
      lastSeen.set(user.id, Date.now())
      void touchLastSeen(user.id).catch(() => {})
    }
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
      life,
      ladder
    })
  } catch (error) {
    console.error("Player unavailable:", error)
    return NextResponse.json({ error: "Player unavailable" }, { status: 503 })
  }
}
