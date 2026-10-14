"use client"

import { useEffect, useRef } from "react"
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl"

export type HustlePin = {
  id: string
  position: { lat: number; lng: number }
  label: string
  title: string
  tone: "pickup" | "dropoff" | "offer"
}

const TONES = {
  pickup: { bg: "#f59e0b", ring: "rgba(245,158,11,0.55)", size: 34, pulse: true },
  dropoff: { bg: "#10b981", ring: "rgba(16,185,129,0.55)", size: 34, pulse: true },
  offer: { bg: "#334155", ring: "rgba(15,23,42,0.6)", size: 26, pulse: false }
} as const

function makeElement(pin: HustlePin): HTMLDivElement {
  const tone = TONES[pin.tone]
  // The map positions the outer element with a CSS transform, so the pulse
  // (which animates transform too) lives on an inner element.
  const el = document.createElement("div")
  el.title = pin.title
  const dot = document.createElement("div")
  dot.textContent = pin.label
  Object.assign(dot.style, {
    width: `${tone.size}px`,
    height: `${tone.size}px`,
    borderRadius: "9999px",
    background: tone.bg,
    border: "2px solid rgba(255,255,255,0.95)",
    boxShadow: `0 0 0 4px ${tone.ring}, 0 4px 10px rgba(0,0,0,0.45)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: pin.tone === "offer" ? "12px" : "16px",
    fontWeight: "900",
    color: "#fff",
    animation: tone.pulse ? "tiral-pin-pulse 1.6s ease-in-out infinite" : ""
  })
  el.appendChild(dot)
  return el
}

// Shop pins for the shift: where offers start, and the current job's pickup
// and drop-off. Markers are rebuilt only when a pin's identity or look changes.
export function HustlePins({ map, pins }: { map: MapLibreMap | null; pins: HustlePin[] }) {
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; signature: string }>())

  useEffect(() => {
    if (!map) return
    const seen = new Set<string>()
    for (const pin of pins) {
      seen.add(pin.id)
      const signature = `${pin.tone}|${pin.label}|${pin.position.lat},${pin.position.lng}`
      const existing = markers.current.get(pin.id)
      if (existing?.signature === signature) continue
      existing?.marker.remove()
      const marker = new maplibregl.Marker({ element: makeElement(pin) })
        .setLngLat([pin.position.lng, pin.position.lat])
        .addTo(map)
      markers.current.set(pin.id, { marker, signature })
    }
    for (const [id, entry] of markers.current) {
      if (!seen.has(id)) {
        entry.marker.remove()
        markers.current.delete(id)
      }
    }
  })

  useEffect(() => {
    if (!map) return
    return () => {
      for (const entry of markers.current.values()) entry.marker.remove()
      markers.current.clear()
    }
  }, [map])

  return null
}
