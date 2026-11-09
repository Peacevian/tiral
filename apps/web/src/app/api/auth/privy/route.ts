import { NextRequest, NextResponse } from "next/server"
import { PrivyClient } from "@privy-io/server-auth"
import { findUserById, movePrivyAccount, planPrivyConnect, upsertPrivyAccount } from "@tiral/db"
import { displayNameFromEmail, emailAddress, ethereumAddress } from "@/lib/privyUser"
import {
  isSecureRequest,
  mintSession,
  mintSwitchToken,
  readSessionCookie,
  sessionCookie,
  verifySession
} from "@/lib/session"

// Privy proves the email login. We then set the same tiral_session cookie the
// rest of the game already trusts, so the game server never talks to Privy.
export async function POST(request: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const secret = process.env.PRIVY_APP_SECRET
  if (!appId || !secret) {
    return NextResponse.json({ error: "Sign-in isn't configured" }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown; idToken?: unknown } | null
  const accessToken = typeof body?.token === "string" ? body.token : ""
  const idToken = typeof body?.idToken === "string" ? body.idToken : ""
  if (!accessToken) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const privy = new PrivyClient(appId, secret)
  let userId: string
  try {
    const verified = await privy.verifyAuthToken(accessToken)
    userId = verified.userId
  } catch {
    return NextResponse.json({ error: "Sign-in expired. Try again." }, { status: 401 })
  }

  // The identity token is verified locally. Looking the user up by id is rate-limited,
  // so that call only runs when the token doesn't include the wallet yet.
  let privyUser = null as Awaited<ReturnType<PrivyClient["getUser"]>> | null
  if (idToken) {
    try {
      const fromToken = await privy.getUser({ idToken })
      if (fromToken.id === userId) privyUser = fromToken
    } catch {
      privyUser = null
    }
  }
  if (!privyUser || !ethereumAddress(privyUser)) {
    try {
      privyUser = await privy.getUser(userId)
    } catch {
      return NextResponse.json({ error: "Couldn't confirm that sign-in. Try again." }, { status: 401 })
    }
  }

  const walletAddress = ethereumAddress(privyUser)
  if (!walletAddress) {
    return NextResponse.json({ error: "Your wallet is still being created. Try again in a moment." }, { status: 409 })
  }

  const cookie = readSessionCookie(request.headers.get("cookie"))
  const current = cookie ? await verifySession(cookie) : null
  const plan = await planPrivyConnect({ startedBy: current?.userId ?? null, privyUserId: userId })

  if (plan.kind === "ask") {
    const token = await mintSwitchToken(
      {
        guestUserId: plan.guest.userId,
        ownerUserId: plan.owner.userId,
        guest: { name: plan.guest.name, balance: plan.guest.balance, tier: plan.guest.tier },
        owner: { name: plan.owner.name, balance: plan.owner.balance, tier: plan.owner.tier }
      },
      "privy-switch"
    )
    return NextResponse.json({ status: "ask", token })
  }

  const user =
    plan.kind === "move"
      ? await (async () => {
          await movePrivyAccount({ privyUserId: userId, toUserId: plan.guestUserId, walletAddress })
          return findUserById(plan.guestUserId)
        })()
      : await upsertPrivyAccount(
          { privyUserId: userId, walletAddress, displayName: displayNameFromEmail(emailAddress(privyUser)) },
          plan.guestUserId
        )

  if (!user) return NextResponse.json({ error: "Couldn't finish sign-in" }, { status: 500 })

  const session = await mintSession(user.id, { displayName: user.displayName, avatarUrl: user.avatarUrl })
  const response = NextResponse.json({ status: "ok" })
  response.headers.set("Set-Cookie", sessionCookie(session, isSecureRequest(request.url)))
  return response
}
