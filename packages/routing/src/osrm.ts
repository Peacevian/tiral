import type { LatLng } from "@tiral/game-core"
import type { Route, RouteProfile, RouteService } from "./route.js"

type OsrmResponse = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: {
      coordinates: [number, number][]
    }
  }>
}

const PROFILE_URL: Record<RouteProfile, string> = {
  driving: "driving",
  foot: "foot"
}

export class OsrmRouteService implements RouteService {
  constructor(
    private readonly baseUrl: string = "https://router.project-osrm.org",
    private readonly profile: RouteProfile = "driving"
  ) {}

  async getRoute(
    start: LatLng,
    end: LatLng,
    profile: RouteProfile = this.profile
  ): Promise<Route> {
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`
    const url = `${this.baseUrl}/route/v1/${PROFILE_URL[profile]}/${coordinates}?overview=full&geometries=geojson`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`OSRM request failed with status ${response.status}`)
    }
    const data = (await response.json()) as OsrmResponse
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error(`OSRM returned code ${data.code}`)
    }
    const osrmRoute = data.routes[0]!
    return {
      coordinates: osrmRoute.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
      distanceMeters: osrmRoute.distance,
      durationSeconds: osrmRoute.duration
    }
  }
}
