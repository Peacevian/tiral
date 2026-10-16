import { NextRequest, NextResponse } from "next/server"
import { getSharedPrizeRace } from "@tiral/db"
import { winPreview, winStory } from "@/lib/share/cards"

export const runtime = "nodejs"

// A prize race winner's brag card: ?size=preview for link previews, else the story poster.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string; place: string }> }) {
  const { code, place } = await params
  const position = Number(place)
  if (!/^[A-Za-z0-9]{5}$/.test(code) || !Number.isInteger(position) || position < 1 || position > 5) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const race = await getSharedPrizeRace(code).catch(() => null)
  const image = race ? await (request.nextUrl.searchParams.get("size") === "preview" ? winPreview(race, position) : winStory(race, position)) : null
  return image ?? NextResponse.json({ error: "Not found" }, { status: 404 })
}
