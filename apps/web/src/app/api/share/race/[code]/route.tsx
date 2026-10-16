import { NextRequest, NextResponse } from "next/server"
import { getSharedPrizeRace } from "@tiral/db"
import { racePreview, raceStory } from "@/lib/share/cards"

export const runtime = "nodejs"

// A prize race's share image: ?size=preview for link previews, else the story poster.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  if (!/^[A-Za-z0-9]{5}$/.test(code)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const race = await getSharedPrizeRace(code).catch(() => null)
  if (!race) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return request.nextUrl.searchParams.get("size") === "preview" ? racePreview(race) : raceStory(race)
}
