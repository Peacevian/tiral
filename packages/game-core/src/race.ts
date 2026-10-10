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
