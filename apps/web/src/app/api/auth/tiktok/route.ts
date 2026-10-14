import { NextRequest, NextResponse } from "next/server"
import { buildAuthorizeUrl, getTikTokConfig } from "@/lib/tiktok"
import { mintOAuthState, readSessionCookie, verifySession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const config = getTikTokConfig()
    let guestUserId: string | null = null
    const token = readSessionCookie(request.headers.get("cookie"))
    if (token) {
      const claims = await verifySession(token)
      guestUserId = claims?.userId ?? null
    }
    const state = await mintOAuthState(guestUserId)
    return NextResponse.redirect(buildAuthorizeUrl(config, state))
  } catch (error) {
    console.error("TikTok login start failed:", error)
    return NextResponse.redirect(new URL("/play?auth_error=tiktok_unavailable", request.url))
  }
}
