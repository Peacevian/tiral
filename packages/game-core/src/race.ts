import type { LatLng } from "./geo.js"

export type RacePhase = "lobby" | "countdown" | "racing" | "finished"

export type PlayerState = {
  id: string
  name: string
  startPointId: string | null
  position: LatLng
  progress: number
  finished: boolean
  finishOrder: number | null
}

export type RaceState = {
  roomId: string
  zoneId: string
  phase: RacePhase
  countdownSeconds: number
  startedAt: number | null
  destinationId: string | null
  players: Record<string, PlayerState>
}

/** A finish line must be at least this far from every racer's start. */
export const MIN_BOUNTY_DISTANCE_METERS = 500

/**
 * Pick the bounty for a race. Candidates are the reachable bounty spots with
 * the distance to the nearest racer's start. Prefer a random spot at least
 * `minMeters` from everyone; if none is that far (racers spread across a small
 * zone), take the one furthest from its nearest racer. Starting on (or next
 * to) a bounty therefore never hands anyone an instant win. `roll` is in [0, 1).
 */
export function chooseBounty<T>(candidates: Array<{ item: T; nearestStartMeters: number }>, roll: number, minMeters = MIN_BOUNTY_DISTANCE_METERS): T | null {
  if (candidates.length === 0) return null
  const far = candidates.filter((candidate) => candidate.nearestStartMeters >= minMeters)
  if (far.length > 0) return far[Math.min(far.length - 1, Math.floor(Math.max(0, roll) * far.length))]!.item
  return candidates.reduce((best, candidate) => (candidate.nearestStartMeters > best.nearestStartMeters ? candidate : best)).item
}

/** How many different people are in a field: sessions of one account count once. */
export function distinctRacers(userIds: Array<string | null>): number {
  const accounts = new Set<string>()
  let anonymous = 0
  for (const userId of userIds) {
    if (userId) accounts.add(userId)
    else anonymous++
  }
  return accounts.size + anonymous
}
