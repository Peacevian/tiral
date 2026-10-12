"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

type MiniMapProps = {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  markers?: boolean
  glideTo?: { center: [number, number]; zoom: number }
}

function dot(color: string, size: number, glow: string): HTMLDivElement {
  const el = document.createElement("div")
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.borderRadius = "9999px"
  el.style.background = color
  el.style.border = "2px solid rgba(255,255,255,0.9)"
  el.style.boxShadow = glow
  return el
}

// Real live MapLibre map (same tiles/style as the game).
// Draggable; wheel-zoom off so it never traps page scroll.
export function MiniMap({
  center = [32.5811, 0.3136],
  zoom = 13.6,
  pitch = 55,
  bearing = -18,
  markers = true,
  glideTo
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef({ center, zoom, pitch, bearing, markers, glideTo })
  propsRef.current = { center, zoom, pitch, bearing, markers, glideTo }

  useEffect(() => {
    if (!containerRef.current) return
    const opts = propsRef.current
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: opts.center,
      zoom: opts.zoom,
      pitch: opts.pitch,
      bearing: opts.bearing,
      attributionControl: { compact: true },
      scrollZoom: false,
      boxZoom: false,
      dragRotate: false,
      touchPitch: false,
      keyboard: false,
      renderWorldCopies: false
    })
    map.on("load", () => {
      if (opts.markers) {
        new maplibregl.Marker({ element: dot("#f59e0b", 18, "0 0 16px rgba(245,158,11,0.9)") })
          .setLngLat([32.5808, 0.3134])
          .addTo(map)
        new maplibregl.Marker({ element: dot("#22d3ee", 14, "0 0 12px rgba(34,211,238,0.9)") })
          .setLngLat([32.5792, 0.3116])
          .addTo(map)
      }
      // One gentle glide on load so it feels alive; user drags take over after.
      if (opts.glideTo) {
        map.flyTo({ center: opts.glideTo.center, zoom: opts.glideTo.zoom, duration: 3500, essential: false })
      }
    })
    return () => {
      map.remove()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" />
}
