import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { claimPlot } from "@tiral/db"
import { MAX_PLOTS_PER_PLAYER } from "@tiral/game-core"
import { readSessionCookie, verifySession } from "@/lib/session"

const ERRORS = {
  unknown: "That plot isn't for sale.",
  taken: "Someone else holds that plot.",
  limit: `You can hold ${MAX_PLOTS_PER_PLAYER} plots at a time.`,
  insufficient: "Not enough BNG."
} as const

// Claim a free plot: { plotId, ref? } (ref makes a retry safe).
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { plotId?: unknown; ref?: unknown } | null
  if (!body || typeof body.plotId !== "string" || !/^-?\d{1,5}_-?\d{1,5}$/.test(body.plotId)) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const ref = typeof body.ref === "string" && /^[\w-]{8,64}$/.test(body.ref) ? body.ref : randomUUID()
  try {
    const result = await claimPlot({ userId: claims.userId, plotId: body.plotId, refId: ref })
    if (!result.ok) return NextResponse.json({ error: ERRORS[result.reason], reason: result.reason, balance: result.balance }, { status: 409 })
    return NextResponse.json({ plot: result.plot, balance: result.balance })
  } catch (error) {
    console.error("Plot claim failed:", error)
    return NextResponse.json({ error: "Couldn't claim it. Try again." }, { status: 500 })
  }
}
