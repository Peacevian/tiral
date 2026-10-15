"use client"

import { useEffect, useRef } from "react"
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl"

export type StartPinPlayer = {
  sessionId: string
  name: string
  startAt: { lat: number; lng: number } | null
}
function makePinElement(label: string, own: boolean): HTMLDivElement {
  const el = document.createElement("div")
  if (own) {
    // Hollow pulsing drop-zone ring: the avatar stands inside it, never hidden.
    // The pulse animates transform, which the map uses to place the marker,
    // so it lives on an inner element.
    const ring = document.createElement("div")
    ring.style.width = "46px"
    ring.style.height = "46px"
    ring.style.borderRadius = "9999px"
    ring.style.background = "rgba(245,158,11,0.12)"
    ring.style.border = "3px solid #f59e0b"
    ring.style.boxShadow = "0 0 18px rgba(245,158,11,0.8)"
    ring.style.animation = "tiral-pin-pulse 1.6s ease-in-out infinite"
    el.appendChild(ring)
  } else {
    el.style.width = "26px"
    el.style.height = "26px"
    el.style.borderRadius = "9999px"
    el.style.background = "#64748b"
    el.style.border = "2px solid rgba(255,255,255,0.95)"
    el.style.boxShadow = "0 0 8px rgba(0,0,0,0.6)"
    el.style.display = "flex"
    el.style.alignItems = "center"
    el.style.justifyContent = "center"
    el.style.fontSize = "13px"
    el.style.fontWeight = "900"
    el.style.color = "#fff"
    el.textContent = label
  }
  return el
}
// MapLibre markers for every placed start pin. Markers are keyed by session
// and reconciled in place (never torn down on data updates), so pins stay
// put across the frequent room-state broadcasts. Own pin is amber, rivals slate.
export function StartPins({
  map,
  players,
  ownSessionId
}: {
  map: MapLibreMap | null
  players: StartPinPlayer[]
  ownSessionId: string | null
}) {
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; own: boolean }>())

  // Reconcile markers with the latest pins when they change: only touches what
  // actually changed (add / move / restyle / remove).
  useEffect(() => {
    if (!map) return
    const seen = new Set<string>()
    for (const player of players) {
      if (!player.startAt) continue
      seen.add(player.sessionId)
      const own = player.sessionId === ownSessionId
      const label = own ? "★" : player.name.charAt(0).toUpperCase()
      const title = own ? "Your start" : `${player.name}'s start`
      const entry = markersRef.current.get(player.sessionId)
      if (entry) {
        const staleLabel =
          !own && entry.marker.getElement().textContent !== label
        if (entry.own !== own || staleLabel) {
          // Side changed or rival initial changed: rebuild the marker.
          entry.marker.remove()
        } else {
          const at = entry.marker.getLngLat()
          if (at.lng !== player.startAt.lng || at.lat !== player.startAt.lat) {
            entry.marker.setLngLat([player.startAt.lng, player.startAt.lat])
          }
          entry.marker.getElement().title = title
          continue
        }
      }
      const el = makePinElement(label, own)
      el.title = title
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([player.startAt.lng, player.startAt.lat])
        .addTo(map)
      markersRef.current.set(player.sessionId, { marker, own })
    }
    for (const [id, entry] of markersRef.current) {
      if (!seen.has(id)) {
        entry.marker.remove()
        markersRef.current.delete(id)
      }
    }
  }, [map, players, ownSessionId])

  // Full cleanup only when the map itself goes away.
  useEffect(() => {
    if (!map) return
    return () => {
      for (const entry of markersRef.current.values()) entry.marker.remove()
      markersRef.current.clear()
    }
  }, [map])

  return null
}
