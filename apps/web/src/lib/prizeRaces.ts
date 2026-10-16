"use client"

import { useCallback, useEffect, useState } from "react"
import { notifyCoinsChanged } from "@/lib/useCoins"

// Prize races from the web API (/api/races/hosted): scheduled ones live in the
// database, so they're listed (and you can say "I'm in") days before their
// room opens an hour ahead of the start.

export type PrizeRace = {
  id: string
  roomCode: string
  host: { id: string; name: string }
  pot: number
  shares: number[]
  message: string | null
  startsAt: string
  countdownSeconds: number
  status: string
  signups: number
  signedUp: boolean
}

export type NewPrizeRace = { pot: number; shares: number[]; message: string; startsAt: string; countdownSeconds: number }

async function send(url: string, init: RequestInit): Promise<{ ok: boolean; error: string | null; body: Record<string, unknown> }> {
  try {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: response.ok, error: typeof body.error === "string" ? body.error : response.ok ? null : "Something went wrong", body }
  } catch {
    return { ok: false, error: "Network is down", body: {} }
  }
}

export function usePrizeRaces() {
  const [races, setRaces] = useState<PrizeRace[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/races/hosted", { cache: "no-store" })
      if (response.ok) setRaces(((await response.json()) as { races: PrizeRace[] }).races)
    } catch {
      // keep what we have
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const create = useCallback(
    async (race: NewPrizeRace) => {
      const result = await send("/api/races/hosted", { method: "POST", body: JSON.stringify(race) })
      if (result.ok) {
        notifyCoinsChanged()
        await refresh()
      }
      return { error: result.error, race: (result.body.race as PrizeRace | undefined) ?? null }
    },
    [refresh]
  )

  const cancel = useCallback(
    async (id: string) => {
      const result = await send(`/api/races/hosted/${id}`, { method: "DELETE" })
      if (result.ok) notifyCoinsChanged()
      await refresh()
      return result.error
    },
    [refresh]
  )

  const signUp = useCallback(
    async (id: string, on: boolean) => {
      const result = await send(`/api/races/hosted/${id}/signup`, { method: "POST", body: JSON.stringify({ on }) })
      await refresh()
      return result.error
    },
    [refresh]
  )

  return { races, loading, refresh, create, cancel, signUp }
}

/** "Fri 18:00" in the player's own clock (Uganda: EAT). */
export function startLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })
}

/** "in 2 h 5 min" / "in 4 min" / "now". */
export function untilLabel(iso: string, now = Date.now()): string {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000)
  if (minutes <= 0) return "now"
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
  return `in ${Math.round(hours / 24)} days`
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/play?join=${encodeURIComponent(code)}`
}

/** Share sheet, or copy the link; resolves to what to tell the player. */
export async function shareRace(race: { roomCode: string; pot: number; host: string; startsAt: string }): Promise<string> {
  const url = inviteLink(race.roomCode)
  const text = `🏆 ${race.pot.toLocaleString("en-US")} BNG prize race by ${race.host}, ${startLabel(race.startsAt)}. Code ${race.roomCode}`
  try {
    if (navigator.share) {
      await navigator.share({ title: "Tiral prize race", text, url })
      return "Shared"
    }
    await navigator.clipboard.writeText(`${text}: ${url}`)
    return "Link copied"
  } catch {
    return `Code: ${race.roomCode}`
  }
}

/**
 * A code for a prize race whose room isn't open yet (more than an hour out):
 * sign the player up instead, and say when it opens. Null if no such race.
 */
export async function signUpByCode(code: string): Promise<string | null> {
  try {
    const response = await fetch("/api/races/hosted", { cache: "no-store" })
    if (!response.ok) return null
    const { races } = (await response.json()) as { races: PrizeRace[] }
    const race = races.find((candidate) => candidate.roomCode === code.trim().toUpperCase() && candidate.status === "scheduled")
    if (!race) return null
    await send(`/api/races/hosted/${race.id}/signup`, { method: "POST", body: JSON.stringify({ on: true }) })
    return `You're in ${race.host.name}'s ${race.pot.toLocaleString("en-US")} BNG prize race (${startLabel(race.startsAt)}). It opens an hour before the start; we'll remind you in your inbox.`
  } catch {
    return null
  }
}
