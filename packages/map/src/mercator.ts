import type { LatLng } from "@tiral/game-core"

export type MercatorPoint = {
  x: number
  y: number
}

const DEG = Math.PI / 180

export function lngLatToMercator({ lng, lat }: LatLng): MercatorPoint {
  const x = (lng + 180) / 360
  const sin = Math.sin(lat * DEG)
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
  return { x, y }
}

export function mercatorToLngLat({ x, y }: MercatorPoint): LatLng {
  const lng = x * 360 - 180
  const n = Math.PI - 2 * Math.PI * y
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lng, lat }
}
