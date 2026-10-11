import { NextRequest, NextResponse } from "next/server"
import {
  createPendingCampaign,
  listBillboardSlots
} from "@tiral/db"
import {
  mintRelworxReference,
  normalizeUgandaMsisdn,
  requestRelworxPayment
} from "@/lib/relworx"

const PRICE_PER_SLOT_UGX = 20000

const BANNED_KEYWORDS = [
  "casino",
  "betting",
  "bet ",
  "porn",
  "xxx",
  "escort",
  "crypto",
  "token sale",
  "airdrop",
  "forex"
]

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      brandName?: unknown
      imagePath?: unknown
      link?: unknown
      slotIds?: unknown
      msisdn?: unknown
    } | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const brandName = typeof body.brandName === "string" ? body.brandName.trim() : ""
    const imagePath = typeof body.imagePath === "string" ? body.imagePath : ""
    const link = typeof body.link === "string" ? body.link.trim() : ""
    const msisdnRaw = typeof body.msisdn === "string" ? body.msisdn : ""
    const slotIds = Array.isArray(body.slotIds)
      ? body.slotIds.filter((id): id is string => typeof id === "string")
      : []

    if (brandName.length < 2 || brandName.length > 40) {
      return NextResponse.json({ error: "Brand name must be 2–40 characters" }, { status: 400 })
    }
    const lowered = `${brandName} ${link}`.toLowerCase()
    if (BANNED_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
      return NextResponse.json({ error: "This brand category is not allowed" }, { status: 400 })
    }
    if (!/^\/api\/billboards\/image\/[0-9a-f]{32}\.(png|jpg|webp)$/.test(imagePath)) {
      return NextResponse.json({ error: "Upload a brand image first" }, { status: 400 })
    }
    if (!isValidHttpUrl(link) || link.length > 300) {
      return NextResponse.json({ error: "Link must be a valid http(s) URL" }, { status: 400 })
    }

    const slots = await listBillboardSlots()
    const validIds = new Set(slots.map((slot) => slot.id))
    const uniqueSlotIds = [...new Set(slotIds)].filter((id) => validIds.has(id))
    if (uniqueSlotIds.length === 0) {
      return NextResponse.json({ error: "Choose at least one billboard slot" }, { status: 400 })
    }
    const amountUgx = PRICE_PER_SLOT_UGX * uniqueSlotIds.length

    let msisdn: string
    try {
      msisdn = normalizeUgandaMsisdn(msisdnRaw)
    } catch {
      return NextResponse.json(
        { error: "Enter a valid Uganda number (07… or +256…)" },
        { status: 400 }
      )
    }

    const reference = mintRelworxReference("tiral")
    const campaignId = await createPendingCampaign({
      brandName,
      imagePath,
      link,
      slotIds: uniqueSlotIds,
      amountUgx,
      buyerMsisdn: msisdn,
      relworxReference: reference
    })

    try {
      await requestRelworxPayment({
        reference,
        msisdn,
        amountUgx,
        description: `Tiral billboard ${uniqueSlotIds.length} slot(s)`
      })
    } catch (error) {
      const { failCampaign } = await import("@tiral/db")
      await failCampaign(campaignId).catch(() => {})
      const message = error instanceof Error ? error.message : "Payment request failed"
      const friendly = /rate-limit|5 requests/i.test(message)
        ? "Too many payment prompts — wait a few minutes and retry"
        : message
      return NextResponse.json({ error: friendly }, { status: 502 })
    }

    return NextResponse.json({ campaignId, status: "pending" })
  } catch (error) {
    console.error("Billboard purchase failed:", error)
    return NextResponse.json({ error: "Could not start purchase" }, { status: 500 })
  }
}
