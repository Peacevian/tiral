import { NextRequest, NextResponse } from "next/server"
import { cancelHostedRace } from "@tiral/db"
import { readSessionCookie, verifySession } from "@/lib/session"

// The host cancels before the start: the whole pot comes back, no cut.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  if (!claims) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const result = await cancelHostedRace({ hostUserId: claims.userId, id })
    if (!result.ok) {
      const error = result.reason === "started" ? "It has already started" : result.reason === "not_host" ? "Only the host can cancel" : "Not found"
      return NextResponse.json({ error }, { status: result.reason === "not_found" ? 404 : 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Cancelling a prize race failed:", error)
    return NextResponse.json({ error: "Couldn't cancel. Try again." }, { status: 503 })
  }
}
