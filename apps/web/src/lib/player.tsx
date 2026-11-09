"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { AvatarLoadout } from "@tiral/avatars"
import type { LadderCounts, TierId } from "@tiral/game-core"
import { requestPrivyLogout, SESSION_REFRESH_EVENT } from "@/lib/privy"
import { COINS_CHANGED_EVENT, type WalletEntry } from "@/lib/useCoins"

export type LifeEvent = {
  id: string
  kind: string
  amount: number
  status: "pending" | "paid" | "refused" | "expired" | "info"
  from: string
  text: string
  createdAt: string
  /** Requests only: when it stops waiting for an answer. */
  expiresAt: string | null
}

export type Life = {
  /** Where you live: a rented home, or (id = its look) the house you built. */
  tier: { id: string; name: string; rent: number }
  /** Living in the house you built on your plot (docs/land.md): no rent. */
  ownHome?: { plotId: string; areaName: string } | null
  rentDueAt: string
  stress: number
  balance: number
  pending: number
  events: LifeEvent[]
}

export type PlayerUser = {
  id: string
  displayName: string
  avatarUrl: string | null
  tiktokLinked: boolean
  /** Email login with a wallet. This is what keeps the account. */
  signedIn: boolean
  walletAddress: string | null
  /** GoodDollar face check on the wallet. Guests stay "none". */
  identity: "none" | "verified" | "expired"
  identityExpiresAt: string | null
  /** The runner's look (for the 3D avatar). */
  loadout?: AvatarLoadout
}

export type PlayerNeeds = { energy: number; health: number; resting: boolean }

type PlayerSnapshot = {
  user: PlayerUser
  balance: number
  entries: WalletEntry[]
  needs: PlayerNeeds
  life: Life | null
  /** Jobs done towards the hustle ladder (which gigs are open). */
  ladder: LadderCounts
  /** Career tier, LivTok followers and lives done (docs/career-roadmap.md). */
  career: { tier: TierId; followers: number; lives: number }
}

type PlayerContextValue = {
  /** False until the first answer from the server. */
  ready: boolean
  /** Null when signed out. */
  player: PlayerSnapshot | null
  /** The server couldn't be reached on the last refresh (data may be stale). */
  offline: boolean
  busy: string | null
  error: string | null
  refresh(): Promise<void>
  playAsGuest(): Promise<void>
  logout(): Promise<void>
  eat(foodId: string): Promise<string | null>
  setResting(resting: boolean): Promise<void>
  answer(event: LifeEvent, action: "pay" | "refuse"): Promise<string | null>
  /** Resolves to an error message, or null when moved. */
  moveHouse(tier: string): Promise<string | null>
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const POLL_MS = 60_000
const OFFLINE_RETRY_MS = 5_000

// One source of truth for the signed-in player across the whole app: the
// player bar, hub, home, inbox and wallet all read from here, and every
// change (race payout, food, rent) refreshes it once.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  // A refresh asked for while one is loading (a payout just landed) must not
  // get the older answer: remember it and fetch once more afterwards.
  const again = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    try {
      // Give up after 10 s so a hung server shows as offline, not "checking…" forever.
      const response = await fetch("/api/player", { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as Partial<PlayerSnapshot> & { user: PlayerUser | null }
      setPlayer(body.user ? (body as PlayerSnapshot) : null)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setReady(true)
    }
  }, [])

  const refresh = useCallback((): Promise<void> => {
    // Collapse bursts into at most one fetch now plus one queued after it.
    if (inFlight.current) {
      again.current ??= inFlight.current.then(() => {
        again.current = null
        return refresh()
      })
      return again.current
    }
    const run = load().finally(() => {
      inFlight.current = null
    })
    inFlight.current = run
    return run
  }, [load])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener(COINS_CHANGED_EVENT, onChange)
    window.addEventListener(SESSION_REFRESH_EVENT, onChange)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, POLL_MS)
    return () => {
      window.removeEventListener(COINS_CHANGED_EVENT, onChange)
      window.removeEventListener(SESSION_REFRESH_EVENT, onChange)
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(id)
    }
  }, [refresh])

  // While the server is unreachable, check back every few seconds.
  useEffect(() => {
    if (!offline) return
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, OFFLINE_RETRY_MS)
    return () => clearInterval(id)
  }, [offline, refresh])

  const post = useCallback(async (url: string, body: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    const json = (await response.json().catch(() => ({}))) as { error?: string }
    return { ok: response.ok, error: json.error ?? null }
  }, [])

  const playAsGuest = useCallback(async () => {
    setBusy("guest")
    setError(null)
    try {
      const result = await post("/api/auth/guest", {})
      if (!result.ok) throw new Error()
      await refresh()
    } catch {
      setError("Couldn't start a guest session. Try again.")
    } finally {
      setBusy(null)
    }
  }, [post, refresh])

  const logout = useCallback(async () => {
    setBusy("logout")
    try {
      await post("/api/auth/logout", {})
    } catch {
      // cookie may already be gone
    } finally {
      requestPrivyLogout()
      setPlayer(null)
      setBusy(null)
    }
  }, [post])

  const eat = useCallback(
    async (foodId: string) => {
      setBusy(`food:${foodId}`)
      try {
        const result = await post("/api/needs/eat", { foodId, purchaseId: crypto.randomUUID() })
        await refresh()
        return result.ok ? null : result.error ?? "Couldn't buy that"
      } catch {
        return "Couldn't reach the shop"
      } finally {
        setBusy(null)
      }
    },
    [post, refresh]
  )

  const setResting = useCallback(
    async (resting: boolean) => {
      setBusy("rest")
      try {
        await post("/api/needs/rest", { resting })
        await refresh()
      } finally {
        setBusy(null)
      }
    },
    [post, refresh]
  )

  const answer = useCallback(
    async (event: LifeEvent, action: "pay" | "refuse") => {
      setBusy(`event:${event.id}`)
      try {
        const result = await post(`/api/life/events/${event.id}`, { action })
        await refresh()
        return result.ok ? null : result.error ?? "Couldn't send"
      } catch {
        return "Network is down"
      } finally {
        setBusy(null)
      }
    },
    [post, refresh]
  )

  const moveHouse = useCallback(
    async (tier: string) => {
      setBusy(`move:${tier}`)
      try {
        const result = await post("/api/life/move", { tier })
        await refresh()
        return result.ok ? null : result.error === "Unavailable" ? "Couldn't move right now. Try again." : result.error ?? "Couldn't move"
      } catch {
        return "Network is down"
      } finally {
        setBusy(null)
      }
    },
    [post, refresh]
  )

  const value = useMemo<PlayerContextValue>(
    () => ({ ready, player, offline, busy, error, refresh, playAsGuest, logout, eat, setResting, answer, moveHouse }),
    [ready, player, offline, busy, error, refresh, playAsGuest, logout, eat, setResting, answer, moveHouse]
  )
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext)
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider")
  return value
}
