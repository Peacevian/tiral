import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { payGroundRent } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

const ERRORS = {
  unknown: "That isn't your plot.",
  weeks: "You can't pay that many weeks ahead.",
  insufficient: "Not enough BNG."
} as const

// Pay ground rent on your plot: { plotId, weeks, ref? }.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { plotId?: unknown; weeks?: unknown; ref?: unknown } | null
  if (!body || typeof body.plotId !== "string" || typeof body.weeks !== "number") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const ref = typeof body.ref === "string" && /^[\w-]{8,64}$/.test(body.ref) ? body.ref : randomUUID()
  try {
    const result = await payGroundRent({ userId: claims.userId, plotId: body.plotId, weeks: body.weeks, refId: ref })
    if (!result.ok) return NextResponse.json({ error: ERRORS[result.reason], reason: result.reason, balance: result.balance }, { status: 409 })
    return NextResponse.json({ plot: result.plot, charged: result.charged, balance: result.balance })
  } catch (error) {
    console.error("Ground rent failed:", error)
    return NextResponse.json({ error: "Couldn't pay. Try again." }, { status: 500 })
  }
}
