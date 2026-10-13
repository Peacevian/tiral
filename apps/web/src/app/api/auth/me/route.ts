import { NextRequest, NextResponse } from "next/server"
import { ensureWelcomeGrant, findUserById, getCoinBalance, touchLastSeen } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

export async function GET(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  if (!token) {
    return NextResponse.json({ user: null })
  }
  const claims = await verifySession(token)
  if (!claims) {
    return NextResponse.json({ user: null })
  }
  const user = await findUserById(claims.userId)
  if (!user) {
    return NextResponse.json({ user: null })
  }
  await touchLastSeen(user.id).catch(() => {})
  const balance = await loadBalance(user.id)
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, balance }
  })
}

/** BNG balance, granting the arrival money on first sight. Null if the ledger is unavailable. */
async function loadBalance(userId: string): Promise<number | null> {
  try {
    await ensureWelcomeGrant(userId)
    return await getCoinBalance(userId)
  } catch (error) {
    console.error("Coin balance unavailable:", error)
    return null
  }
}
