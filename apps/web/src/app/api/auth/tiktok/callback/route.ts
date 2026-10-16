import { NextRequest, NextResponse } from "next/server"
import { setAvatarUrl, upsertTikTokAccount } from "@tiral/db"
import { exchangeCode, fetchTikTokUser, getTikTokConfig } from "@/lib/tiktok"
import { storeAvatar } from "@/lib/avatars"
import {
  isSecureRequest,
  mintSession,
  sessionCookie,
  verifyOAuthState
} from "@/lib/session"

export async function POST() {
  // TikTok webhook test events ping this URL; the game does not use
  // webhooks, so acknowledge without action.
  return NextResponse.json({ ok: true })
}

function failure(request: NextRequest, reason: string): NextResponse {
  // Back to the sign-in screen, which explains what went wrong.
  const url = new URL("/play", request.url)
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
    // TikTok's photo links expire within days: keep our own copy.
    const stored = await storeAvatar(user.id, tiktokUser.avatarUrl)
    if (stored) await setAvatarUrl(user.id, stored)
    const token = await mintSession(user.id, {
      displayName: user.displayName,
      avatarUrl: stored ?? user.avatarUrl
    })
    const response = NextResponse.redirect(new URL("/play", request.url))
    response.headers.set("Set-Cookie", sessionCookie(token, isSecureRequest(request.url)))
    return response
  } catch (error) {
    console.error("TikTok callback failed:", error)
    return failure(request, "tiktok_failed")
  }
}
