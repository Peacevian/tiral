import { NextRequest, NextResponse } from "next/server"
import { PRIZE_PROBLEM_TEXT, type PrizeProblem } from "@tiral/game-core"
import { createHostedRace, listHostedRaces } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"
import { refreshTikTokAvatar } from "@/lib/avatars"

async function viewer(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  return token ? await verifySession(token) : null
}

// Upcoming and running prize races (anyone can see them).
export async function GET(request: NextRequest) {
  try {
    const claims = await viewer(request)
    return NextResponse.json({ races: await listHostedRaces(claims?.userId ?? null) })
  } catch (error) {
    console.error("Prize races unavailable:", error)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 })
  }
}

// Host a prize race: the pot is held from the host's wallet right away.
export async function POST(request: NextRequest) {
  const claims = await viewer(request)
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as {
    pot?: unknown
    shares?: unknown
    message?: unknown
    startsAt?: unknown
    countdownSeconds?: unknown
  } | null
  const shares = Array.isArray(body?.shares) ? body.shares.map(Number) : []
  const startsAt = new Date(typeof body?.startsAt === "string" ? body.startsAt : NaN)
  try {
    const result = await createHostedRace({
      hostUserId: claims.userId,
      pot: Number(body?.pot),
      shares,
      message: typeof body?.message === "string" ? body.message : null,
      startsAt,
      countdownSeconds: Number(body?.countdownSeconds)
    })
    // The share poster shows the host's photo: refresh our copy now (in the background).
    if (result.ok) void refreshTikTokAvatar(claims.userId)
    if (!result.ok) {
      const error =
        result.reason === "guest"
          ? "Sign in to host a prize race"
          : result.reason === "insufficient"
            ? "Not enough BNG for that pot"
            : PRIZE_PROBLEM_TEXT[result.reason as PrizeProblem]
      return NextResponse.json({ error, balance: result.balance }, { status: result.reason === "guest" ? 403 : 400 })
    }
    return NextResponse.json({ race: result.race })
  } catch (error) {
    console.error("Hosting a prize race failed:", error)
    return NextResponse.json({ error: "Couldn't create the race. Try again." }, { status: 503 })
  }
}
