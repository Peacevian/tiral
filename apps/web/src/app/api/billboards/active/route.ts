import { NextResponse } from "next/server"
import { listActiveCampaigns, listBillboardSlots } from "@tiral/db"

export async function GET() {
  try {
    const [slots, campaigns] = await Promise.all([
      listBillboardSlots(),
      listActiveCampaigns()
    ])
    return NextResponse.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        lat: slot.lat,
        lng: slot.lng,
        tier: slot.tier
      })),
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        brandName: campaign.brandName,
        imagePath: campaign.imagePath,
        link: campaign.link,
        slotIds: campaign.slotIds
      }))
    })
  } catch (error) {
    console.error("Active billboards failed:", error)
    return NextResponse.json({ error: "Could not load billboards" }, { status: 500 })
  }
}
