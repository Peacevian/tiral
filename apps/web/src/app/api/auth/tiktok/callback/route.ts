import { NextRequest, NextResponse } from "next/server"
import { moveTikTokLink, planTikTokConnect, setAvatarUrl, upsertTikTokAccount } from "@tiral/db"
import { exchangeCode, fetchTikTokUser, getTikTokConfig } from "@/lib/tiktok"
import { storeAvatar } from "@/lib/avatars"
import {
  isSecureRequest,
  mintSession,
  mintSwitchToken,
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
    const account = {
      openId: tiktokUser.openId,
      unionId: tiktokUser.unionId,
      scope: tokens.scope,
      displayName: tiktokUser.displayName,
      avatarUrl: tiktokUser.avatarUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    }
    const plan = await planTikTokConnect({ startedBy: oauthState.guestUserId, openId: tiktokUser.openId })
    if (plan.kind === "ask") {
      // This TikTok already has its own played account and never takes a guest's
      // progress: refresh its tokens, then let the player decide (/connect).
      await upsertTikTokAccount(account)
      const switchToken = await mintSwitchToken({
        guestUserId: plan.guest.userId,
        ownerUserId: plan.owner.userId,
        guest: { name: plan.guest.name, balance: plan.guest.balance, tier: plan.guest.tier },
        owner: { name: plan.owner.name, balance: plan.owner.balance, tier: plan.owner.tier }
      })
      const url = new URL("/connect", request.url)
      url.searchParams.set("t", switchToken)
      return NextResponse.redirect(url)
    }
    // The TikTok's own account never played: the login moves onto the guest.
    if (plan.kind === "move") await moveTikTokLink({ ...account, toUserId: plan.guestUserId })
    const guestUserId = plan.guestUserId
    const user = await upsertTikTokAccount(account, guestUserId ?? undefined)
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
