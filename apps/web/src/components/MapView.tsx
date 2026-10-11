"use client"

import { useEffect, useRef, useImperativeHandle, forwardRef, type Ref } from "react"
import maplibregl from "maplibre-gl"
import type { LatLng, GeoBounds } from "@tiral/game-core"

export type MapHandle = {
  getMap(): maplibregl.Map | null
  project(latLng: LatLng): { x: number; y: number }
  unproject(x: number, y: number): LatLng
}

type MapViewProps = {
  center: LatLng
  zoom: number
  pitch?: number
  bearing?: number
  bounds?: GeoBounds
  onMapReady?: (map: maplibregl.Map) => void
  styleUrl?: string // JSON style URL or inline style object... we'll use a string URL for now
}

const DEFAULT_CENTER = { lng: 32.5825, lat: 0.3476 }

// Greater Kampala metro (Kampala + Wakiso + Mukono fringe + Entebbe
// corridor): wide enough to see the whole city at once, including outlying
// spots like Munyonyo, while keeping players out of the rest of the world.
const KAMPALA_BOUNDS: [[number, number], [number, number]] = [
  [32.3, 0.02],
  [32.85, 0.55]
]

// Minimal vector style: same OpenStreetMap road data underneath (gameplay
// needs accurate streets) without the dense POI label clutter of the
// standard raster tiles. Free, no API key. Attribution required.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const MAP_ATTRIBUTION = "© OpenMapTiles © OpenStreetMap contributors"

function MapView(
  { center = DEFAULT_CENTER, zoom = 15, pitch = 48, bearing = -18, styleUrl, onMapReady }: MapViewProps,
  ref: Ref<MapHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      getMap: () => mapRef.current,
      project: (latLng: LatLng) => {
        if (!mapRef.current) return { x: 0, y: 0 }
        const p = mapRef.current.project([latLng.lng, latLng.lat])
        return { x: p.x, y: p.y }
      },
      unproject: (x: number, y: number) => {
        if (!mapRef.current) return { lat: 0, lng: 0 }
        const lngLat = mapRef.current.unproject([x, y])
        return { lat: lngLat.lat, lng: lngLat.lng }
      }
    }),
    []
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom,
      pitch,
      bearing,
      maxPitch: 65,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: KAMPALA_BOUNDS,
      renderWorldCopies: false,
      attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION }
    })
    map.addControl(new maplibregl.NavigationControl(), "bottom-right")
    map.on("load", () => {
      mapRef.current = map
      onMapReady?.(map)
    })
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" />
}

export default forwardRef(MapView)
