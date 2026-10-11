import { NextRequest, NextResponse } from "next/server"
import { activateCampaign, failCampaign, getCampaignByReference } from "@tiral/db"
import {
  checkRelworxRequestStatus,
  verifyRelworxWebhook,
  type RelworxWebhookBody
} from "@/lib/relworx"

function canonicalWebhookUrl(request: NextRequest): string {
  const base = process.env.PUBLIC_BASE_URL ?? request.nextUrl.origin
  return `${base.replace(/\/$/, "")}/api/billboards/relworx`
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RelworxWebhookBody | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const signature = request.headers.get("relworx-signature")
  if (!verifyRelworxWebhook(canonicalWebhookUrl(request), signature, body)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const reference =
    typeof body.customer_reference === "string" ? body.customer_reference : null
  const internalReference =
    typeof body.internal_reference === "string" ? body.internal_reference : null
  if (!reference || !internalReference) {
    return NextResponse.json({ ok: true })
  }

  try {
    const campaign = await getCampaignByReference(reference)
    if (!campaign || campaign.status === "active") {
      return NextResponse.json({ ok: true })
    }
    // Never trust the webhook body alone — re-check with Relworx.
    const check = await checkRelworxRequestStatus(internalReference)
    if (check.status === "success") {
      await activateCampaign(campaign.id, internalReference)
    } else if (check.status === "failed") {
      await failCampaign(campaign.id)
    }
  } catch (error) {
    console.error("Billboard webhook failed:", error)
  }
  return NextResponse.json({ ok: true })
}
