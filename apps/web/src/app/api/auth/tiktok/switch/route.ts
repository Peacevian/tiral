import { NextRequest, NextResponse } from "next/server"
import { findUserById } from "@tiral/db"
import { isSecureRequest, mintSession, readSessionCookie, sessionCookie, verifySession, verifySwitchToken } from "@/lib/session"

// "Sign in to my TikTok account anyway" from /connect: the player chose to leave
// the guest behind. Only for the guest that started the connect.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const claims = await verifySwitchToken(String(form.get("t") ?? ""))
  if (!claims) return NextResponse.redirect(new URL("/connect", request.url), 303)
  const token = readSessionCookie(request.headers.get("cookie"))
  const current = token ? await verifySession(token) : null
  if (current && current.userId !== claims.guestUserId) return NextResponse.redirect(new URL("/play", request.url), 303)
  const owner = await findUserById(claims.ownerUserId)
  if (!owner) return NextResponse.redirect(new URL("/play?auth_error=tiktok_failed", request.url), 303)
  const session = await mintSession(owner.id, { displayName: owner.displayName, avatarUrl: owner.avatarUrl })
  const response = NextResponse.redirect(new URL("/play", request.url), 303)
  response.headers.set("Set-Cookie", sessionCookie(session, isSecureRequest(request.url)))
  return response
}
