import { NextRequest, NextResponse } from "next/server"
import {
  activateCampaign,
  failCampaign,
  getCampaignById,
  setCampaignStatus
} from "@tiral/db"
import { checkRelworxRequestStatus } from "@/lib/relworx"

const PENDING_TTL_MS = 30 * 60 * 1000

function adminOk(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get("x-admin-secret") === secret
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
        if (check.status === "success") {
          await activateCampaign(campaign.id, campaign.relworxInternalRef)
          return NextResponse.json({ status: "active" })
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
