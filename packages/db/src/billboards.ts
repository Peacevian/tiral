import { and, count, eq, gte, inArray, lte } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { billboardCampaigns, billboardImpressions, billboardSlots } from "./schema.js"

export async function listBillboardSlots(db: Database = getDatabase()) {
  return db.select().from(billboardSlots)
}

export type ActiveCampaignRow = {
  id: string
  brandName: string
  imagePath: string
  link: string
  slotIds: string[]
}

export async function listActiveCampaigns(
  now: Date = new Date(),
  db: Database = getDatabase()
): Promise<ActiveCampaignRow[]> {
  const rows = await db
    .select({
      id: billboardCampaigns.id,
      brandName: billboardCampaigns.brandName,
      imagePath: billboardCampaigns.imagePath,
      link: billboardCampaigns.link,
      slotIds: billboardCampaigns.slotIds,
      endsAt: billboardCampaigns.endsAt
    })
    .from(billboardCampaigns)
    .where(
      and(
        eq(billboardCampaigns.status, "active"),
        lte(billboardCampaigns.startsAt, now)
      )
    )
  return rows
    .filter((row) => row.endsAt.getTime() > now.getTime())
    .map(({ endsAt: _endsAt, ...rest }) => rest)
}

export async function createPendingCampaign(
  input: {
    brandName: string
    imagePath: string
    link: string
    slotIds: string[]
    amountUgx: number
    buyerMsisdn: string
    relworxReference: string
  },
  db: Database = getDatabase()
) {
  const startsAt = new Date()
  const rows = await db
    .insert(billboardCampaigns)
    .values({
      brandName: input.brandName,
      imagePath: input.imagePath,
      link: input.link,
      slotIds: input.slotIds,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 72 * 60 * 60 * 1000),
      status: "pending",
      amountUgx: input.amountUgx,
      buyerMsisdn: input.buyerMsisdn,
      relworxReference: input.relworxReference
    })
    .returning({ id: billboardCampaigns.id })
  const row = rows[0]
  if (!row) throw new Error("Failed to create campaign")
  return row.id
}

export async function getCampaignByReference(
  reference: string,
  db: Database = getDatabase()
) {
  const rows = await db
    .select()
    .from(billboardCampaigns)
    .where(eq(billboardCampaigns.relworxReference, reference))
    .limit(1)
  return rows[0] ?? null
}

export async function getCampaignById(id: string, db: Database = getDatabase()) {
  const rows = await db
    .select()
    .from(billboardCampaigns)
    .where(eq(billboardCampaigns.id, id))
    .limit(1)
  return rows[0] ?? null
}

/** Remember Relworx's id for the payment prompt, so its status can be re-checked later. */
export async function setCampaignInternalRef(id: string, internalReference: string, db: Database = getDatabase()) {
  await db
    .update(billboardCampaigns)
    .set({ relworxInternalRef: internalReference })
    .where(and(eq(billboardCampaigns.id, id), eq(billboardCampaigns.status, "pending")))
}

/**
 * Turn a paid campaign on. Only a pending (or expired-while-waiting) campaign
 * can go live, so a late or replayed confirmation never revives one that was
 * disabled by a moderator or failed. Returns true if it is now active.
 */
export async function activateCampaign(
  id: string,
  internalReference: string,
  db: Database = getDatabase()
): Promise<boolean> {
  const updated = await db
    .update(billboardCampaigns)
    .set({ status: "active", relworxInternalRef: internalReference })
    .where(and(eq(billboardCampaigns.id, id), inArray(billboardCampaigns.status, ["pending", "expired"])))
    .returning({ id: billboardCampaigns.id })
  if (updated.length > 0) return true
  return (await getCampaignById(id, db))?.status === "active"
}

/** A payment that failed: only a campaign still waiting can fail. */
export async function failCampaign(id: string, db: Database = getDatabase()) {
  await db
    .update(billboardCampaigns)
    .set({ status: "failed" })
    .where(and(eq(billboardCampaigns.id, id), eq(billboardCampaigns.status, "pending")))
}

/** How many payment prompts went to this number since `since` (anti-spam). */
export async function countRecentCampaignsForMsisdn(msisdn: string, since: Date, db: Database = getDatabase()) {
  const [row] = await db
    .select({ total: count() })
    .from(billboardCampaigns)
    .where(and(eq(billboardCampaigns.buyerMsisdn, msisdn), gte(billboardCampaigns.createdAt, since)))
  return row?.total ?? 0
}

export async function setCampaignStatus(
  id: string,
  status: "disabled" | "expired",
  db: Database = getDatabase()
) {
  await db
    .update(billboardCampaigns)
    .set({ status })
    .where(eq(billboardCampaigns.id, id))
}

export async function logImpression(
  input: {
    raceId: string | null
    slotId: string
    campaignId: string | null
    viewerCount: number
  },
  db: Database = getDatabase()
) {
  await db.insert(billboardImpressions).values({
    raceId: input.raceId,
    slotId: input.slotId,
    campaignId: input.campaignId,
    viewerCount: input.viewerCount,
    windowStart: new Date()
  })
}
