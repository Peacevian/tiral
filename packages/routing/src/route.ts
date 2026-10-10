import type { LatLng } from "@tiral/game-core"

export type Route = {
  coordinates: LatLng[]
  distanceMeters: number
  durationSeconds: number
}

export type RouteProfile = "driving" | "foot"

export type RouteService = {
  getRoute(start: LatLng, end: LatLng, profile?: RouteProfile): Promise<Route>
}
