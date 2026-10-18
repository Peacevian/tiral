import { NextRequest, NextResponse } from "next/server"
import {
  findUserById,
  getProfileStats,
  getRecentRaces,
  hasTikTokLink,
  updateAvatarLoadout,
  saveHouse,
  updateGuestDisplayName
} from "@tiral/db"
import { isValidLoadout } from "@tiral/avatars"
import { readSessionCookie, verifySession } from "@/lib/session"

async function requireUserId(request: NextRequest): Promise<string | null> {
  const token = readSessionCookie(request.headers.get("cookie"))
  if (!token) return null
  const claims = await verifySession(token)
  return claims?.userId ?? null
}

export async function GET(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) {
    return NextResponse.json({ user: null })
  }
  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ user: null })
  }
  const [tiktokLinked, stats, recentRaces] = await Promise.all([
    hasTikTokLink(userId),
    getProfileStats(userId),
    getRecentRaces(userId)
  ])
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      loadout: user.avatarLoadout,
      house: user.houseLoadout,
      tiktokLinked
    },
    stats,
    recentRaces: recentRaces.map((race) => ({
      ...race,
      finishedAt: race.finishedAt.toISOString()
    }))
  })
}

export async function PATCH(request: NextRequest) {
  const userId = await requireUserId(request)
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as {
    displayName?: unknown
    loadout?: unknown
    house?: unknown
  } | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "Invalid display name" }, { status: 400 })
    }
    const updated = await updateGuestDisplayName(userId, body.displayName)
    if (!updated) {
      return NextResponse.json(
        { error: "Name must be 2–24 characters, and TikTok-linked names cannot be changed here" },
        { status: 400 }
      )
    }
  }

  if (body.loadout !== undefined) {
    if (!isValidLoadout(body.loadout)) {
      return NextResponse.json({ error: "Invalid avatar customization" }, { status: 400 })
    }
    await updateAvatarLoadout(userId, body.loadout)
  }

  if (body.house !== undefined) {
    // Placed furniture must be yours; painting and new floors are paid for.
    const saved = await saveHouse(userId, body.house)
    if (!saved.ok) {
      const error =
        saved.reason === "insufficient"
          ? `The painter and fundi cost ${saved.fee.toLocaleString("en-US")} BNG: not enough BNG.`
          : saved.reason === "not_owned"
            ? "Some of that furniture isn't yours. Buy it first."
            : "Invalid house customization"
      return NextResponse.json({ error }, { status: saved.reason === "insufficient" ? 409 : 400 })
    }
  }

  const user = await findUserById(userId)
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      loadout: user.avatarLoadout,
      house: user.houseLoadout
    }
  })
}
