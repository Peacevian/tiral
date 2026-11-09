import { NextRequest, NextResponse } from "next/server"
import { clearIdentity, findPrivyAccount, rememberIdentity } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"
import { storedIdentity, type IdentityStatus } from "@/lib/identity"
import { readChainIdentity } from "@/lib/identityChain"

export type IdentityResponse = {
  status: IdentityStatus | "linked" | "taken"
  expiresAt: string | null
}

// Reads the Celo identity contract for the signed-in wallet and saves the
// result. The redirect back from GoodDollar is not trusted on its own.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

  const account = await findPrivyAccount(claims.userId)
  if (!account) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

  let chain
  try {
    chain = await readChainIdentity(account.walletAddress)
  } catch (error) {
    console.error("GoodDollar identity read failed:", error)
    return NextResponse.json({ error: "Celo didn't answer. Try again in a moment." }, { status: 503 })
  }

  if (!chain.root) {
    if (account.identityRoot) await clearIdentity(claims.userId)
    return NextResponse.json({ status: "none", expiresAt: null } satisfies IdentityResponse)
  }

  if (!chain.self) {
    return NextResponse.json({ status: "linked", expiresAt: null } satisfies IdentityResponse)
  }

  const saved = await rememberIdentity(claims.userId, { root: chain.root, expiresAt: chain.expiresAt })
  if (saved === "taken") {
    return NextResponse.json({ status: "taken", expiresAt: null } satisfies IdentityResponse)
  }

  const view = storedIdentity({ identityRoot: chain.root, identityExpiresAt: chain.expiresAt })
  return NextResponse.json(view satisfies IdentityResponse)
}
