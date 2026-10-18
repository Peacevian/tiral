"use client"

import { useCallback, useEffect, useState } from "react"
import type { FurnitureGrade, FurnitureId } from "@tiral/houses"
import { notifyCoinsChanged } from "@/lib/useCoins"

// The furniture you own (bought at the markets; placed or in storage).

export type OwnedItem = { id: string; item: FurnitureId; grade: FurnitureGrade; color: string; price: number }

export function useHouseItems(enabled: boolean) {
  const [items, setItems] = useState<OwnedItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/house/items")
      if (!response.ok) return
      const body = (await response.json()) as { items?: OwnedItem[] }
      setItems(body.items ?? [])
    } catch {
      // keep what we had
    }
  }, [])

  useEffect(() => {
    if (enabled && items === null) void reload()
  }, [enabled, items, reload])

  /** Buy a piece; resolves to the new piece, or an error message. */
  const buy = useCallback(async (item: FurnitureId, grade: FurnitureGrade, color: string): Promise<OwnedItem | string> => {
    setBusy(`buy:${item}:${grade}`)
    try {
      const ref = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const response = await fetch("/api/house/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, grade, color, ref })
      })
      const body = (await response.json().catch(() => ({}))) as { owned?: OwnedItem | null; error?: string }
      if (!response.ok || !body.owned) return body.error ?? "Couldn't buy it. Try again."
      const owned = body.owned
      setItems((current) => [...(current ?? []), owned])
      notifyCoinsChanged()
      return owned
    } catch {
      return "Network is down"
    } finally {
      setBusy(null)
    }
  }, [])

  /** Sell a piece back for half; resolves to what you got, or an error message. */
  const sell = useCallback(async (id: string): Promise<number | string> => {
    setBusy(`sell:${id}`)
    try {
      const response = await fetch("/api/house/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      })
      const body = (await response.json().catch(() => ({}))) as { paid?: number; error?: string }
      if (!response.ok || body.paid === undefined) return body.error ?? "Couldn't sell it. Try again."
      setItems((current) => (current ?? []).filter((item) => item.id !== id))
      notifyCoinsChanged()
      return body.paid
    } catch {
      return "Network is down"
    } finally {
      setBusy(null)
    }
  }, [])

  return { items, busy, buy, sell, reload }
}
