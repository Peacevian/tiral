import { NextRequest, NextResponse } from "next/server"
import { upsertTikTokAccount } from "@tiral/db"
import { exchangeCode, fetchTikTokUser, getTikTokConfig } from "@/lib/tiktok"
import {
  isSecureRequest,
  mintSession,
  sessionCookie,
  verifyOAuthState
} from "@/lib/session"

function failure(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/", request.url)
  url.searchParams.set("auth_error", reason)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const code = params.get("code")
  const state = params.get("state")

  if (params.get("error") || !code || !state) {
    return failure(request, "tiktok_denied")
  }

  const oauthState = await verifyOAuthState(state)
  if (!oauthState) {
    return failure(request, "invalid_state")
  }

  try {
    const config = getTikTokConfig()
    const tokens = await exchangeCode(config, code)
    const tiktokUser = await fetchTikTokUser(tokens.accessToken)
    const user = await upsertTikTokAccount(
      {
        openId: tiktokUser.openId,
        unionId: tiktokUser.unionId,
        scope: tokens.scope,
        displayName: tiktokUser.displayName,
        avatarUrl: tiktokUser.avatarUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      },
      oauthState.guestUserId ?? undefined
    )
    const token = await mintSession(user.id)
    const response = NextResponse.redirect(new URL("/", request.url))
    response.headers.set("Set-Cookie", sessionCookie(token, isSecureRequest(request.url)))
    return response
  } catch (error) {
    console.error("TikTok callback failed:", error)
    return failure(request, "tiktok_failed")
  }
}
