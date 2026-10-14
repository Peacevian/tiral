"use client"

// Fired after anything that changes the balance (race payouts, purchases),
// so every balance chip on screen refreshes.
export const COINS_CHANGED_EVENT = "tiral:coins-changed"

export function notifyCoinsChanged() {
  window.dispatchEvent(new Event(COINS_CHANGED_EVENT))
}

export type WalletEntry = {
  id: string
  delta: number
  reason: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export const REASON_LABELS: Record<string, string> = {
  welcome_grant: "Arrived in Kampala",
  race_finish: "Finished a race",
  race_podium: "Podium bonus",
  first_win_of_day: "First win today",
  race_streak: "Daily streak",
  food: "Food",
  rent: "Rent",
  family: "Sent to family",
  shock: "Bad luck",
  gig_pay: "Boda delivery"
}

export function formatCoins(amount: number): string {
  return Math.round(amount).toLocaleString("en-US")
}
