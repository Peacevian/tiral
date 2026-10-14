"use client"

import { useCallback, useEffect, useState } from "react"
import { notifyCoinsChanged } from "@/lib/useCoins"

export type LifeEvent = {
  id: string
  kind: string
  amount: number
  status: "pending" | "paid" | "refused" | "expired" | "info"
  from: string
  text: string
  createdAt: string
  expiresAt: string | null
}

export type Life = {
  tier: { id: string; name: string; rent: number }
  rentDueAt: string
  stress: number
  balance: number
  pending: number
  events: LifeEvent[]
}

/** Signed-in player's rent, stress and inbox. Fetching it also catches life up (rent, new requests). */
export function useLife() {
  const [life, setLife] = useState<Life | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/life")
      if (!response.ok) return
      const next = (await response.json()) as Life
      setLife((previous) => {
        // Rent or a shock may have moved coins: let balance chips refresh.
        if (previous && previous.balance !== next.balance) notifyCoinsChanged()
        return next
      })
    } catch {
      // keep the last known value
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  return { life, refresh }
}
