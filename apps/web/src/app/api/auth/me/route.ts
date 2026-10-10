import { NextRequest, NextResponse } from "next/server"
import { findUserById, touchLastSeen } from "@tiral/db"
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
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }
  })
}
