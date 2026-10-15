import { createHash, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import {
  activateCampaign,
  failCampaign,
  getCampaignById,
  setCampaignStatus
} from "@tiral/db"
import { checkRelworxRequestStatus } from "@/lib/relworx"

const PENDING_TTL_MS = 30 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminOk(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  // Compare digests in constant time (no timing hints about the secret).
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(request.headers.get("x-admin-secret") ?? ""), digest(secret))
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const campaign = await getCampaignById(id)
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  // Lazy backstop: re-check Relworx while still pending, expire stale rows.
  if (campaign.status === "pending") {
    const ageMs = Date.now() - new Date(campaign.createdAt).getTime()
    if (ageMs > PENDING_TTL_MS) {
      await setCampaignStatus(campaign.id, "expired").catch(() => {})
      return NextResponse.json({ status: "expired" })
    }
    if (campaign.relworxInternalRef) {
      try {
        const check = await checkRelworxRequestStatus(campaign.relworxInternalRef)
        if (check.status === "success" && !(check.amountUgx > 0 && check.amountUgx < campaign.amountUgx)) {
          const active = await activateCampaign(campaign.id, campaign.relworxInternalRef)
          return NextResponse.json({ status: active ? "active" : "pending" })
        }
        if (check.status === "failed") {
          await failCampaign(campaign.id)
          return NextResponse.json({ status: "failed" })
        }
      } catch (error) {
        console.error("Campaign status re-check failed:", error)
      }
    }
    return NextResponse.json({ status: "pending" })
  }
  return NextResponse.json({ status: campaign.status })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!adminOk(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null
  if (body?.status !== "disabled") {
    return NextResponse.json({ error: "Only status=disabled is supported" }, { status: 400 })
  }
  const campaign = await getCampaignById(id)
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  await setCampaignStatus(id, "disabled")
  return NextResponse.json({ ok: true })
}
