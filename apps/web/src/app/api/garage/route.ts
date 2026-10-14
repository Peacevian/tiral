import { NextRequest, NextResponse } from "next/server"
import { buyBike, customizeBike, getGarage, leaseBike, serviceBike, setActiveBike } from "@tiral/db"
import type { BikeLook } from "@tiral/game-core"
import { readSessionCookie, verifySession } from "@/lib/session"

async function userIdFrom(request: NextRequest) {
  const token = readSessionCookie(request.headers.get("cookie"))
  const claims = token ? await verifySession(token) : null
  return claims?.userId ?? null
}

// Your bikes: owned, leasing, or taken back.
export async function GET(request: NextRequest) {
  const userId = await userIdFrom(request)
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    return NextResponse.json(await getGarage(userId))
  } catch (error) {
    console.error("Garage unavailable:", error)
    return NextResponse.json({ error: "Garage unavailable" }, { status: 503 })
  }
}

const MESSAGES = {
  insufficient: "Not enough BNG",
  not_allowed: "That bike isn't available that way",
  not_found: "That bike isn't yours",
  invalid: "Some of those parts aren't in the shop"
} as const

/** Shape-check a look from the client (the shop catalogue is checked in the db). */
function parseLook(value: unknown): BikeLook | null {
  if (!value || typeof value !== "object") return null
  const look = value as Record<string, unknown>
  const str = (key: string) => (typeof look[key] === "string" && (look[key] as string).length <= 32 ? (look[key] as string) : null)
  const bool = (key: string) => look[key] === true
  const paint = str("paint")
  const seat = str("seat")
  const grips = str("grips")
  const model = str("model")
  if (!paint || !seat || !grips || !model) return null
  const slogan = look.slogan === null ? null : Number.isInteger(look.slogan) ? (look.slogan as number) : NaN
  if (Number.isNaN(slogan)) return null
  const underglow = look.underglow === null ? null : str("underglow")
  if (look.underglow !== null && !underglow) return null
  return {
    model: model as BikeLook["model"],
    paint,
    seat,
    slogan,
    grips,
    tassels: bool("tassels"),
    rack: bool("rack"),
    crashBars: bool("crashBars"),
    underglow
  }
}

// Buy, lease, service, or choose which bike to ride.
export async function POST(request: NextRequest) {
  const userId = await userIdFrom(request)
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as {
    action?: unknown
    model?: unknown
    bikeId?: unknown
    purchaseId?: unknown
  } | null
  const action = body?.action
  const model = typeof body?.model === "string" ? body.model : ""
  const bikeId = typeof body?.bikeId === "string" && /^[0-9a-f-]{36}$/i.test(body.bikeId) ? body.bikeId : null
  const purchaseId = typeof body?.purchaseId === "string" && /^[0-9a-f-]{16,64}$/i.test(body.purchaseId) ? body.purchaseId : ""
  try {
    let result
    if (action === "buy" && purchaseId) result = await buyBike({ userId, model, purchaseId })
    else if (action === "lease" && purchaseId) result = await leaseBike({ userId, model, purchaseId })
    else if (action === "service" && bikeId && purchaseId) result = await serviceBike({ userId, bikeId, purchaseId })
    else if (action === "ride") result = await setActiveBike({ userId, bikeId })
    else if (action === "customize" && bikeId && purchaseId) {
      const look = parseLook((body as { look?: unknown }).look)
      if (!look) return NextResponse.json({ error: "Bad request" }, { status: 400 })
      result = await customizeBike({ userId, bikeId, look, purchaseId })
    }
    else return NextResponse.json({ error: "Bad request" }, { status: 400 })
    if (!result.ok) return NextResponse.json({ error: MESSAGES[result.reason] }, { status: 400 })
    return NextResponse.json(await getGarage(userId))
  } catch (error) {
    console.error("Garage action failed:", error)
    return NextResponse.json({ error: "Garage unavailable" }, { status: 503 })
  }
}
