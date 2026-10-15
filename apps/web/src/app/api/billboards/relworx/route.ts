import { NextRequest, NextResponse } from "next/server"
import { activateCampaign, failCampaign, getCampaignByReference } from "@tiral/db"
import {
  checkRelworxRequestStatus,
  verifyRelworxWebhook,
  webhookConfigured,
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

  // Production refuses every webhook until RELWORX_WEBHOOK_KEY is set; paid
  // campaigns still go live through the status re-check the advertiser polls.
  if (!webhookConfigured()) {
    console.error("Billboard webhook refused: RELWORX_WEBHOOK_KEY is not set")
    return NextResponse.json({ ok: false }, { status: 503 })
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
    if (!campaign || campaign.status !== "pending") {
      return NextResponse.json({ ok: true })
    }
    // The payment must be the one we asked for this campaign: the internal
    // reference Relworx gave us at purchase. Another payment's reference
    // can't switch this campaign on.
    if (!campaign.relworxInternalRef || campaign.relworxInternalRef !== internalReference) {
      console.warn("Billboard webhook reference mismatch for campaign", campaign.id)
      return NextResponse.json({ ok: true })
    }
    // Never trust the webhook body alone — re-check with Relworx.
    const check = await checkRelworxRequestStatus(campaign.relworxInternalRef)
    if (check.status === "success") {
      if (check.amountUgx > 0 && check.amountUgx < campaign.amountUgx) {
        console.warn("Billboard payment below price for campaign", campaign.id)
        await failCampaign(campaign.id)
      } else {
        await activateCampaign(campaign.id, campaign.relworxInternalRef)
      }
    } else if (check.status === "failed") {
      await failCampaign(campaign.id)
    }
  } catch (error) {
    console.error("Billboard webhook failed:", error)
  }
  return NextResponse.json({ ok: true })
}
