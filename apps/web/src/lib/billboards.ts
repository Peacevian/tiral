export const ROTATION_SECONDS = 15

export type ActiveBillboardAd = {
  campaignId: string
  brandName: string
  imagePath: string
  link: string
}

/** Deterministic rotation: every viewer computes the same ad at the same second. */
export function selectCurrentAd(ads: ActiveBillboardAd[], nowMs: number): ActiveBillboardAd | null {
  if (ads.length === 0) return null
  const slot = Math.floor(nowMs / 1000 / ROTATION_SECONDS)
  const index = ((slot % ads.length) + ads.length) % ads.length
  return ads[index] ?? null
}

/** Equal share of airtime for each ad on a slot, as a 0..1 fraction. */
export function rotationShare(adCount: number): number {
  if (adCount <= 0) return 0
  return 1 / adCount
}
