import { NextRequest, NextResponse } from "next/server"
import { moveIntoOwnHouse } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

const ERRORS = {
  unknown: "You can only move into a house you built.",
  not_ready: "It isn't finished yet.",
  same: "You already live there.",
  insufficient: "Not enough BNG for the move."
} as const

// Move into the house you built: { plotId }.
export async function POST(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { plotId?: unknown } | null
  if (!body || typeof body.plotId !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    const result = await moveIntoOwnHouse({ userId: claims.userId, plotId: body.plotId })
    if (!result.ok) return NextResponse.json({ error: ERRORS[result.reason], reason: result.reason, fee: result.fee }, { status: 409 })
    return NextResponse.json({ ok: true, fee: result.fee })
  } catch (error) {
    console.error("Moving in failed:", error)
    return NextResponse.json({ error: "Couldn't move in. Try again." }, { status: 500 })
  }
}
