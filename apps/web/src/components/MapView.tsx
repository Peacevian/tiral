"use client"

import { useEffect, useRef, useImperativeHandle, forwardRef, type Ref } from "react"
import maplibregl from "maplibre-gl"
// Styles the map credits (OpenStreetMap attribution is required) and the canvas.
import "maplibre-gl/dist/maplibre-gl.css"
import { loadMapStyle } from "@/lib/mapStyle"
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

// No pan lock: the map stays freely movable/scrollable at any time.
// Races start centered on the player (Kampala), and ◎ recenters on demand.
const MIN_ZOOM = 9

// Minimal vector style (OpenFreeMap Positron, slimmed in lib/mapStyle.ts):
// same OpenStreetMap road data underneath (gameplay needs accurate streets)
// without the dense POI label clutter. Free, no API key. Attribution required.
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
    let cancelled = false
    let created: maplibregl.Map | null = null
    // The map is built once the trimmed style is ready (one small fetch).
    void loadMapStyle().then((style) => {
      if (cancelled || !containerRef.current) return
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: [center.lng, center.lat],
        zoom,
        pitch,
        bearing,
        maxPitch: 65,
        minZoom: MIN_ZOOM,
        maxZoom: 18,
        renderWorldCopies: false,
        // Many Android phones are 3× density: drawing the map at 9× the pixels
        // costs GPU time and battery for detail nobody can see. 2× is plenty.
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        attributionControl: false
      })
      created = map
      // No zoom/compass buttons: they sat under the sprint button and right
      // thumb stick on phones (pinch to zoom, ◎ to recenter). The credit sits
      // bottom-left as a small ⓘ.
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }), "bottom-left")
      map.on("load", () => {
        mapRef.current = map
        onMapReady?.(map)
      })
    })
    return () => {
      cancelled = true
      created?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" />
}

export default forwardRef(MapView)
